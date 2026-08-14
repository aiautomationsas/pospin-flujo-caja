import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SiigoCredentials,
  SiigoAuthResponse,
  SiigoInvoice,
  SiigoSyncStats,
} from '../types/flujo_caja';

export class SiigoAPIClient {
  private baseUrl: string;
  private username: string;
  private accessKey: string;
  private partnerId: string;
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;
  private customerCache: Map<string, string> = new Map();

  constructor(credentials?: Partial<SiigoCredentials>) {
    this.username =
      credentials?.username || process.env.SIIGO_USERNAME || '';
    this.accessKey =
      credentials?.access_key || process.env.SIIGO_ACCESS_KEY || '';
    this.partnerId =
      credentials?.partner_id || process.env.SIIGO_PARTNER_ID || '';
    this.baseUrl =
      credentials?.base_url ||
      process.env.SIIGO_BASE_URL ||
      'https://api.siigo.com';
  }

  /**
   * Autentica con SIIGO y almacena el token de acceso en memoria con manejo de expiración.
   */
  public async obtenerToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.tokenExpiresAt && now < this.tokenExpiresAt - 60000) {
      return this.token;
    }

    if (!this.username || !this.accessKey) {
      throw new Error(
        'Credenciales de SIIGO incompletas (requiere username y access_key)'
      );
    }

    const url = `${this.baseUrl}/auth`;
    const payload = {
      username: this.username,
      access_key: this.accessKey,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Status ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      const data: SiigoAuthResponse = await response.json();
      this.token = data.access_token;

      const expiresInMs = (data.expires_in || 86400) * 1000;
      this.tokenExpiresAt = Date.now() + expiresInMs;

      return this.token;
    } catch (error: unknown) {
      console.error('Error de autenticación con SIIGO:', error);
      const msg = (error as Error).message || String(error);
      throw new Error(`No se pudo conectar a SIIGO: ${msg}`);
    }
  }

  /**
   * Genera los headers HTTP requeridos para consumir endpoints autenticados de SIIGO.
   */
  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.obtenerToken();
    return {
      Authorization: `Bearer ${token}`,
      'Partner-Id': this.partnerId,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Consulta detalle de una factura específica por su UUID en SIIGO.
   */
  public async consultarFacturaPorId(id: string): Promise<Record<string, unknown> | null> {
    const url = `${this.baseUrl}/v1/invoices/${id}`;
    const headers = await this.getHeaders();
    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Consulta el informe oficial de Cuentas por Cobrar (Cartera Vigente) en SIIGO.
   */
  public async consultarCuentasPorCobrar(): Promise<Record<string, unknown>[]> {
    const url = `${this.baseUrl}/v1/accounts-receivable`;
    const headers = await this.getHeaders();
    const cuentas: Record<string, unknown>[] = [];
    let page = 1;

    try {
      while (true) {
        const res = await fetch(`${url}?page_size=100&page=${page}`, { method: 'GET', headers });
        if (!res.ok) break;
        const data = await res.json();
        const results = data.results || [];
        if (results.length === 0) break;
        cuentas.push(...results);
        const total = data.pagination?.total_results || 0;
        if (cuentas.length >= total || page >= 50) break;
        page++;
      }
      return cuentas;
    } catch {
      return cuentas;
    }
  }

  /**
   * Consulta detalles de un cliente en SIIGO por NIT o ID para obtener la Razón Social real.
   */
  public async obtenerNombreClienteReal(nitOrId: string): Promise<string | null> {
    if (!nitOrId) return null;
    if (this.customerCache.has(nitOrId)) {
      return this.customerCache.get(nitOrId) || null;
    }

    try {
      const headers = await this.getHeaders();
      let response = await fetch(`${this.baseUrl}/v1/customers?identification=${encodeURIComponent(nitOrId)}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        response = await fetch(`${this.baseUrl}/v1/customers?query=${encodeURIComponent(nitOrId)}`, {
          method: 'GET',
          headers,
        });
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const results = data.results || [];
      if (results.length > 0) {
        const cust = results[0];
        let realName = '';
        if (Array.isArray(cust.name)) {
          realName = cust.name.map((n: unknown) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean).join(' ');
        } else if (typeof cust.name === 'string') {
          realName = cust.name.trim();
        }

        if (!realName && typeof cust.company_name === 'string') {
          realName = cust.company_name.trim();
        }

        if (!realName && cust.person_name) {
          if (typeof cust.person_name === 'string') realName = cust.person_name.trim();
          else if (typeof cust.person_name === 'object') {
            const p = cust.person_name as Record<string, string>;
            realName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
          }
        }

        if (!realName && Array.isArray(cust.contacts) && cust.contacts.length > 0) {
          const c = cust.contacts[0];
          if (c.first_name || c.last_name) {
            realName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
          }
        }

        if (realName) {
          this.customerCache.set(nitOrId, realName);
          return realName;
        }
      }
    } catch (err) {
      console.warn(`No se pudo consultar nombre de cliente para NIT ${nitOrId}:`, err);
    }

    return null;
  }

  /**
   * Consulta facturas de venta desde SIIGO.
   * Si diasAtras es 0 o >= 3650, consulta todo el historial sin restricciones de fecha.
   */
  public async consultarFacturasVenta(
    diasAtras: number = 365
  ): Promise<SiigoInvoice[]> {
    const url = `${this.baseUrl}/v1/invoices`;
    const headers = await this.getHeaders();
    const facturas: SiigoInvoice[] = [];
    let page = 1;
    const pageSize = 100;

    const queryParams = new URLSearchParams({
      page_size: pageSize.toString(),
    });

    if (diasAtras > 0 && diasAtras < 3650) {
      const fechaFin = new Date();
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaFin.getDate() - diasAtras);
      queryParams.set('date_start', fechaInicio.toISOString().split('T')[0]);
      queryParams.set('date_end', fechaFin.toISOString().split('T')[0]);
    }

    try {
      while (true) {
        queryParams.set('page', page.toString());

        const response = await fetch(`${url}?${queryParams.toString()}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(
            `Error consultando facturas en SIIGO (${response.status}): ${errText}`
          );
        }

        const data = await response.json();
        const results: SiigoInvoice[] = data.results || [];

        if (results.length === 0) {
          break;
        }

        facturas.push(...results);

        const totalResults = data.pagination?.total_results || 0;
        if (facturas.length >= totalResults || page >= 100) {
          break;
        }

        page++;
      }

      return facturas;
    } catch (error: unknown) {
      console.error('Error al consultar facturas en SIIGO:', error);
      throw error;
    }
  }

  /**
   * Consulta el reporte de cuentas por pagar en SIIGO.
   */
  public async consultarCuentasPorPagar(): Promise<Record<string, unknown>[]> {
    const url = `${this.baseUrl}/v1/accounts-payable`;
    const headers = await this.getHeaders();
    const cuentasPagar: Record<string, unknown>[] = [];
    let page = 1;
    const pageSize = 100;

    try {
      while (true) {
        const queryParams = new URLSearchParams({
          page_size: pageSize.toString(),
          page: page.toString(),
        });

        const response = await fetch(`${url}?${queryParams.toString()}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(
            `Error consultando cuentas por pagar en SIIGO (${response.status}): ${errText}`
          );
        }

        const data = await response.json();
        const results: Record<string, unknown>[] = data.results || [];

        if (results.length === 0) {
          break;
        }

        cuentasPagar.push(...results);

        const totalResults = data.pagination?.total_results || 0;
        if (cuentasPagar.length >= totalResults || page >= 50) {
          break;
        }

        page++;
      }

      return cuentasPagar;
    } catch (error: unknown) {
      console.error('Error al consultar cuentas por pagar en SIIGO:', error);
      throw error;
    }
  }
}

/**
 * Extrae el nombre del cliente soportando todas las variantes de estructura de la API v1/v2 de SIIGO.
 */
function parseCustomerInfo(customerObj: Record<string, unknown>): { name: string; nit: string } {
  const customer = customerObj || {};

  let nit = '';
  if (typeof customer.identification === 'string') nit = customer.identification.trim();
  else if (typeof customer.identification === 'number') nit = String(customer.identification);
  else if (typeof customer.id === 'string' || typeof customer.id === 'number') nit = String(customer.id);
  else if (typeof customer.nit === 'string') nit = customer.nit.trim();

  if (!nit) nit = '900000000';

  let name = '';
  if (Array.isArray(customer.name)) {
    name = customer.name.map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean).join(' ');
  } else if (typeof customer.name === 'string') {
    name = customer.name.trim();
  }

  if (!name && typeof customer.company_name === 'string') {
    name = customer.company_name.trim();
  }

  if (!name && customer.person_name) {
    if (typeof customer.person_name === 'string') {
      name = customer.person_name.trim();
    } else if (typeof customer.person_name === 'object') {
      const p = customer.person_name as Record<string, string>;
      name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    }
  }

  if (!name && typeof customer.commercial_name === 'string') {
    name = customer.commercial_name.trim();
  }

  return { name, nit };
}

/**
 * Sincroniza facturas y clientes desde SIIGO a Supabase en lote ultra-optimizado.
 * Extrae correctamente `balance` y `payments[].due_date` aplicando la regla oficial de SIIGO API.
 */
export async function sincronizarCarteraSiigo(
  supabaseClient: unknown,
  siigoClient: SiigoAPIClient,
  diasAtras: number = 365
): Promise<SiigoSyncStats> {
  const supabase = supabaseClient as SupabaseClient;
  const stats: SiigoSyncStats = {
    clientes_creados: 0,
    facturas_creadas: 0,
    facturas_actualizadas: 0,
    exitosa: true,
    facturas_detalle: [],
  };

  try {
    const facturasSiigo = await siigoClient.consultarFacturasVenta(diasAtras);
    if (!facturasSiigo || facturasSiigo.length === 0) {
      return stats;
    }

    // 1. Pre-cargar nombres de clientes en paralelo desde SIIGO API
    const nitsParaConsultar = new Set<string>();
    for (const fSiigo of facturasSiigo) {
      const customerRaw = (fSiigo.customer as unknown as Record<string, unknown>) || {};
      const { name: customerName, nit: customerNit } = parseCustomerInfo(customerRaw);
      if (!customerName || customerName.startsWith('Cliente NIT')) {
        if (customerNit) nitsParaConsultar.add(customerNit);
      }
    }

    if (nitsParaConsultar.size > 0) {
      await Promise.all(
        Array.from(nitsParaConsultar).map((nit) => siigoClient.obtenerNombreClienteReal(nit))
      );
    }

    // 2. Cargar mapa de clientes existentes en Supabase en 1 sola consulta masiva
    const { data: clientesExistentes } = await supabase
      .from('clientes')
      .select('id, nombre, contacto');

    const clienteMap = new Map<string, { id: number; nombre: string }>();
    if (clientesExistentes) {
      for (const c of clientesExistentes) {
        if (c.contacto && c.contacto.startsWith('NIT: ')) {
          const nit = c.contacto.replace('NIT: ', '').trim();
          clienteMap.set(nit, { id: c.id, nombre: c.nombre });
        }
        clienteMap.set(c.nombre, { id: c.id, nombre: c.nombre });
      }
    }

    const hoyStr = new Date().toISOString().split('T')[0];

    // 3. Procesar facturas e insertar/actualizar clientes
    for (const fSiigo of facturasSiigo) {
      const customerRaw = (fSiigo.customer as unknown as Record<string, unknown>) || {};
      const { nit: customerNit } = parseCustomerInfo(customerRaw);
      let { name: customerName } = parseCustomerInfo(customerRaw);

      if (!customerName || customerName.startsWith('Cliente NIT')) {
        const fetchedName = await siigoClient.obtenerNombreClienteReal(customerNit);
        if (fetchedName) {
          customerName = fetchedName;
        } else if (!customerName) {
          customerName = `Cliente NIT ${customerNit}`;
        }
      }

      let clienteId: number | null = null;
      const clienteExistente = clienteMap.get(customerNit) || clienteMap.get(customerName);

      if (clienteExistente) {
        clienteId = clienteExistente.id;
        if (
          clienteExistente.nombre.startsWith('Cliente NIT') &&
          !customerName.startsWith('Cliente NIT')
        ) {
          await supabase
            .from('clientes')
            .update({ nombre: customerName })
            .eq('id', clienteId);
          clienteMap.set(customerNit, { id: clienteId, nombre: customerName });
        }
      } else {
        const { data: nuevoCliente, error: errInsertCliente } =
          await supabase
            .from('clientes')
            .insert({
              nombre: customerName,
              contacto: `NIT: ${customerNit}`,
              activo: true,
            })
            .select('id')
            .single();

        if (errInsertCliente || !nuevoCliente) {
          const { data: cFallback } = await supabase.from('clientes').select('id').limit(1);
          clienteId = cFallback?.[0]?.id || 101;
        } else {
          clienteId = nuevoCliente.id;
          clienteMap.set(customerNit, { id: nuevoCliente.id, nombre: customerName });
          stats.clientes_creados++;
        }
      }

      // Formatear datos de la factura
      const prefix = fSiigo.prefix || '';
      const number = String(fSiigo.number || '');
      const numeroCompleto = prefix ? `${prefix}${number}` : number;

      const valor = Number(fSiigo.total || 0);

      // Extraer saldo pendiente real (balance) desde la raíz del objeto de SIIGO
      let balance = valor;
      if (typeof fSiigo.balance === 'number') {
        balance = fSiigo.balance;
      } else if (fSiigo.due && typeof (fSiigo.due as unknown as Record<string, unknown>).balance === 'number') {
        balance = Number((fSiigo.due as unknown as Record<string, unknown>).balance);
      }

      // Extraer fechas de vencimiento desde el arreglo payments
      const fechaEmision = fSiigo.date;
      const payments = Array.isArray(fSiigo.payments) ? (fSiigo.payments as Array<Record<string, unknown>>) : [];
      let fechaVencimiento = fechaEmision;

      if (payments.length > 0) {
        const firstPaymentWithDate = payments.find((p) => p && typeof p.due_date === 'string' && p.due_date.trim());
        if (firstPaymentWithDate && typeof firstPaymentWithDate.due_date === 'string') {
          fechaVencimiento = firstPaymentWithDate.due_date.trim();
        }
      } else if (fSiigo.due && typeof (fSiigo.due as unknown as Record<string, unknown>).date === 'string') {
        fechaVencimiento = String((fSiigo.due as unknown as Record<string, unknown>).date);
      }

      // REGLA OFICIAL DE SIIGO:
      // 1. Pagada: balance === 0
      // 2. Vencida: balance > 0 Y al menos un vencimiento (payments[].due_date) es < hoy
      // 3. Pendiente: balance > 0 Y vencimiento >= hoy
      let estado: 'pagada' | 'parcial' | 'vencida' | 'pendiente';
      if (balance <= 0) {
        estado = 'pagada';
      } else if (balance < valor) {
        // Pago parcial registrado
        const tieneVencimientoPasado = payments.some(
          (p) => p && typeof p.due_date === 'string' && p.due_date.trim() < hoyStr
        );
        estado = tieneVencimientoPasado ? 'vencida' : 'parcial';
      } else {
        // Sin pagos (balance === valor)
        const tieneVencimientoPasado = payments.length > 0
          ? payments.some((p) => p && typeof p.due_date === 'string' && p.due_date.trim() < hoyStr)
          : fechaVencimiento < hoyStr;

        estado = tieneVencimientoPasado ? 'vencida' : 'pendiente';
      }

      if (stats.facturas_detalle) {
        stats.facturas_detalle.push({
          numero: numeroCompleto,
          cliente_nombre: customerName,
          valor,
          saldo_pendiente: balance,
          estado,
          fecha_vencimiento: fechaVencimiento,
        });
      }

      const { data: facturaExistente } = await supabase
        .from('facturas')
        .select('id, fecha_estimada_recaudo')
        .eq('numero', numeroCompleto)
        .limit(1);

      if (facturaExistente && facturaExistente.length > 0) {
        const factId = facturaExistente[0].id;
        await supabase
          .from('facturas')
          .update({
            cliente_id: clienteId,
            valor,
            estado,
            fecha_vencimiento: fechaVencimiento,
          })
          .eq('id', factId);
        stats.facturas_actualizadas++;
      } else {
        await supabase
          .from('facturas')
          .insert({
            cliente_id: clienteId,
            numero: numeroCompleto,
            fecha_emision: fechaEmision,
            fecha_vencimiento: fechaVencimiento,
            fecha_estimada_recaudo: fechaVencimiento,
            valor,
            estado,
          });
        stats.facturas_creadas++;
      }
    }

    return stats;
  } catch (error: unknown) {
    stats.exitosa = false;
    stats.error = (error as Error).message || String(error);
    throw error;
  }
}

export const syncSiigoCartera = sincronizarCarteraSiigo;
