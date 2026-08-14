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
   * Consulta facturas de venta desde SIIGO.
   * Rango por defecto: 365 días (1 año completo) para garantizar captura de cartera vencida.
   */
  public async consultarFacturasVenta(
    diasAtras: number = 365
  ): Promise<SiigoInvoice[]> {
    const url = `${this.baseUrl}/v1/invoices`;

    const fechaFin = new Date();
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaFin.getDate() - diasAtras);

    const fechaFinStr = fechaFin.toISOString().split('T')[0];
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];

    const headers = await this.getHeaders();
    const facturas: SiigoInvoice[] = [];
    let page = 1;
    const pageSize = 100;

    try {
      while (true) {
        const queryParams = new URLSearchParams({
          date_start: fechaInicioStr,
          date_end: fechaFinStr,
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
        if (facturas.length >= totalResults || page >= 50) {
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

  // 1. Extraer NIT / Identificación
  let nit = '';
  if (typeof customer.identification === 'string') nit = customer.identification.trim();
  else if (typeof customer.identification === 'number') nit = String(customer.identification);
  else if (typeof customer.id === 'string' || typeof customer.id === 'number') nit = String(customer.id);
  else if (typeof customer.nit === 'string') nit = customer.nit.trim();

  if (!nit) nit = '900000000'; // Default fallback NIT si no viene explícito

  // 2. Extraer Nombre / Razon Social
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

  if (!name && nit && nit !== '900000000') {
    name = `Cliente NIT ${nit}`;
  }

  if (!name) {
    name = 'Cliente SIIGO Colombia';
  }

  return { name, nit };
}

/**
 * Sincroniza facturas y clientes desde SIIGO a Supabase con detalle extendido y rango ampliado.
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

    const hoyStr = new Date().toISOString().split('T')[0];

    for (const fSiigo of facturasSiigo) {
      const customerRaw = (fSiigo.customer as unknown as Record<string, unknown>) || {};
      const { name: customerName, nit: customerNit } = parseCustomerInfo(customerRaw);

      // 1. Sincronizar Cliente en Supabase
      let clienteId: number | null = null;
      const { data: clienteExistente, error: errCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('nombre', customerName)
        .limit(1);

      if (errCliente) {
        console.error('Error consultando cliente en Supabase:', errCliente);
      }

      if (clienteExistente && clienteExistente.length > 0) {
        clienteId = clienteExistente[0].id;
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

        if (errInsertCliente) {
          console.error('Error al crear cliente en Supabase:', errInsertCliente);
          // Fallback en caso de duplicados
          const { data: cFallback } = await supabase.from('clientes').select('id').limit(1);
          clienteId = cFallback?.[0]?.id || 101;
        } else {
          clienteId = nuevoCliente.id;
          stats.clientes_creados++;
        }
      }

      // 2. Formatear datos de la factura
      const prefix = fSiigo.prefix || '';
      const number = String(fSiigo.number || '');
      const numeroCompleto = prefix ? `${prefix}${number}` : number;

      const valor = Number(fSiigo.total || 0);
      const balance = Number(fSiigo.due?.balance !== undefined ? fSiigo.due.balance : valor);
      const fechaEmision = fSiigo.date;
      const fechaVencimiento = fSiigo.due?.date || fechaEmision;

      // Determinar estado de la factura
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

      // Agregar a lista de detalle
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

      // 3. Upsert factura preservando fecha_estimada_recaudo
      const { data: facturaExistente, error: errFactura } = await supabase
        .from('facturas')
        .select('id, fecha_estimada_recaudo')
        .eq('numero', numeroCompleto)
        .limit(1);

      if (errFactura) {
        console.error('Error al consultar factura en Supabase:', errFactura);
      }

      if (facturaExistente && facturaExistente.length > 0) {
        const factId = facturaExistente[0].id;
        const { error: errUpdate } = await supabase
          .from('facturas')
          .update({
            valor,
            estado,
            fecha_vencimiento: fechaVencimiento,
          })
          .eq('id', factId);

        if (errUpdate) {
          console.error('Error al actualizar factura:', errUpdate);
        } else {
          stats.facturas_actualizadas++;
        }
      } else {
        const { error: errInsertFactura } = await supabase
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

        if (errInsertFactura) {
          console.error('Error al insertar factura:', errInsertFactura);
        } else {
          stats.facturas_creadas++;
        }
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
