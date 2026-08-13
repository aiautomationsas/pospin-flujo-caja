/**
 * Cliente de integración nativa con la API oficial de SIIGO Colombia para Next.js / Node.js
 * Portado desde core/siigo_api.py
 */

import type {
  SiigoCredentials,
  SiigoAuthResponse,
  SiigoInvoice,
  SiigoSyncStats,
} from '../types/flujo_caja.ts';

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
      
      // Expira en expires_in segundos o por defecto 24 horas (86400s)
      const expiresInMs = (data.expires_in || 86400) * 1000;
      this.tokenExpiresAt = Date.now() + expiresInMs;

      return this.token;
    } catch (error: any) {
      console.error('Error de autenticación con SIIGO:', error);
      throw new Error(`No se pudo conectar a SIIGO: ${error.message || error}`);
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
   * Consulta facturas de venta desde SIIGO de los últimos N días con paginación automática.
   */
  public async consultarFacturasVenta(
    diasAtras: number = 90
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
        if (facturas.length >= totalResults || page >= 20) {
          break;
        }

        page++;
      }

      return facturas;
    } catch (error: any) {
      console.error('Error al consultar facturas en SIIGO:', error);
      throw error;
    }
  }

  /**
   * Consulta el reporte de cuentas por pagar en SIIGO.
   */
  public async consultarCuentasPorPagar(): Promise<any[]> {
    const url = `${this.baseUrl}/v1/accounts-payable`;
    const headers = await this.getHeaders();
    const cuentasPagar: any[] = [];
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
        const results: any[] = data.results || [];

        if (results.length === 0) {
          break;
        }

        cuentasPagar.push(...results);

        const totalResults = data.pagination?.total_results || 0;
        if (cuentasPagar.length >= totalResults || page >= 20) {
          break;
        }

        page++;
      }

      return cuentasPagar;
    } catch (error: any) {
      console.error('Error al consultar cuentas por pagar en SIIGO:', error);
      throw error;
    }
  }
}

/**
 * Sincroniza facturas y clientes desde SIIGO a Supabase preservando fechas de recaudo estimadas.
 */
export async function sincronizarCarteraSiigo(
  supabaseClient: any,
  siigoClient: SiigoAPIClient
): Promise<SiigoSyncStats> {
  const stats: SiigoSyncStats = {
    clientes_creados: 0,
    facturas_creadas: 0,
    facturas_actualizadas: 0,
    exitosa: true,
  };

  try {
    const facturasSiigo = await siigoClient.consultarFacturasVenta(90);
    if (!facturasSiigo || facturasSiigo.length === 0) {
      return stats;
    }

    const hoyStr = new Date().toISOString().split('T')[0];

    for (const fSiigo of facturasSiigo) {
      const customer = fSiigo.customer || {};
      const customerNit = customer.identification;
      
      let customerName = 'Cliente Desconocido';
      if (Array.isArray(customer.name)) {
        customerName = customer.name[0] || 'Cliente Desconocido';
      } else if (typeof customer.name === 'string') {
        customerName = customer.name;
      }

      if (!customerNit) {
        continue;
      }

      // 1. Sincronizar Cliente en Supabase
      let clienteId: number | null = null;
      const { data: clienteExistente, error: errCliente } = await supabaseClient
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
          await supabaseClient
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
          throw errInsertCliente;
        }

        clienteId = nuevoCliente.id;
        stats.clientes_creados++;
      }

      // 2. Formatear datos de la factura
      const prefix = fSiigo.prefix || '';
      const number = String(fSiigo.number || '');
      const numeroCompleto = prefix ? `${prefix}${number}` : number;

      const valor = Number(fSiigo.total || 0);
      const balance = Number(fSiigo.due?.balance || 0);
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

      // 3. Upsert factura preservando fecha_estimada_recaudo
      const { data: facturaExistente, error: errFactura } = await supabaseClient
        .from('facturas')
        .select('id, fecha_estimada_recaudo')
        .eq('numero', numeroCompleto)
        .limit(1);

      if (errFactura) {
        console.error('Error al consultar factura en Supabase:', errFactura);
      }

      if (facturaExistente && facturaExistente.length > 0) {
        const factId = facturaExistente[0].id;
        const { error: errUpdate } = await supabaseClient
          .from('facturas')
          .update({
            valor,
            estado,
            fecha_vencimiento: fechaVencimiento,
          })
          .eq('id', factId);

        if (errUpdate) {
          console.error('Error al actualizar factura:', errUpdate);
          throw errUpdate;
        }

        stats.facturas_actualizadas++;
      } else {
        const { error: errInsertFactura } = await supabaseClient
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
          throw errInsertFactura;
        }

        stats.facturas_creadas++;
      }
    }

    return stats;
  } catch (error: any) {
    stats.exitosa = false;
    stats.error = error.message || String(error);
    throw error;
  }
}
