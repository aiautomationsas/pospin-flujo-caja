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
   * Consulta Recibos de Caja / Comprobantes de Pago en SIIGO (vouchers).
   */
  public async consultarRecibosCaja(): Promise<Record<string, unknown>[]> {
    const url = `${this.baseUrl}/v1/vouchers`;
    const headers = await this.getHeaders();
    const recibos: Record<string, unknown>[] = [];
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
          break;
        }

        const data = await response.json();
        const results: Record<string, unknown>[] = data.results || [];

        if (results.length === 0) {
          break;
        }

        recibos.push(...results);

        const totalResults = data.pagination?.total_results || 0;
        if (recibos.length >= totalResults || page >= 10) {
          break;
        }

        page++;
      }

      return recibos;
    } catch (error: unknown) {
      console.warn('Error al consultar recibos de caja en SIIGO:', error);
      return [];
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
 * Cruzando también los Recibos de Caja (vouchers) para abonar facturas pagadas.
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

    // Consultar Recibos de Caja (Vouchers) para cruzar pagos reales
    const recibosCaja = await siigoClient.consultarRecibosCaja().catch(() => []);

    // Mapa de abonos/pagos acumulados por número de factura o id de factura
    const abonosPorFactura = new Map<string, number>();
    for (const rc of recibosCaja) {
      const items = Array.isArray(rc.items) ? (rc.items as Record<string, unknown>[]) : [];
      for (const item of items) {
        const inv = item.invoice as Record<string, unknown> | undefined;
        const val = Number(item.value || 0);
        if (inv && val > 0) {
          const num = String(inv.number || '');
          const prefix = String(inv.prefix || '');
          const numComp = prefix ? `${prefix}${num}` : num;
          if (numComp) {
            abonosPorFactura.set(numComp, (abonosPorFactura.get(numComp) || 0) + val);
          }
        }
      }
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

      // Extraer saldo pendiente base (balance) desde SIIGO
      let baseBalance = valor;
      if (typeof fSiigo.balance === 'number') {
        baseBalance = fSiigo.balance;
      } else if (fSiigo.due && typeof (fSiigo.due as unknown as Record<string, unknown>).balance === 'number') {
        baseBalance = Number((fSiigo.due as unknown as Record<string, unknown>).balance);
      }

      // Restar abonos encontrados en Recibos de Caja (vouchers)
      const totalAbonado = abonosPorFactura.get(numeroCompleto) || 0;
      const balance = Math.max(0, baseBalance - totalAbonado);

      // Extraer fecha de vencimiento real desde la lista de pagos/cuotas (payments[0].due_date)
      const fechaEmision = fSiigo.date;
      let fechaVencimiento = fechaEmision;
      if (Array.isArray(fSiigo.payments) && fSiigo.payments.length > 0) {
        const p0 = fSiigo.payments[0] as Record<string, unknown>;
        if (p0 && typeof p0.due_date === 'string' && p0.due_date.trim()) {
          fechaVencimiento = p0.due_date.trim();
        }
      } else if (fSiigo.due && typeof (fSiigo.due as unknown as Record<string, unknown>).date === 'string') {
        fechaVencimiento = String((fSiigo.due as unknown as Record<string, unknown>).date);
      }

      // Determinar estado contable de la factura
      let estado: 'pagada' | 'parcial' | 'vencida' | 'pendiente';
      if (balance <= 0) {
        estado = 'pagada';
      } else if (balance < valor) {
        estado = 'parcial';
      } else {
        if (fechaVencimiento < hoyStr) {
          estado = 'vencida';
        } else {
          estado = 'pendiente';
        }
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
