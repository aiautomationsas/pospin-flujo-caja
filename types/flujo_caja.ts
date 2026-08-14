/**
 * Tipos e interfaces TypeScript para el módulo de Flujo de Caja (Grupo Pospin).
 * Mapeo completo del esquema de base de datos Supabase / Postgres,
 * modelos del motor de proyección financiera, DTOs de mutación e integración con SIIGO API.
 */

// ==========================================
// 1. Roles y Autenticación
// ==========================================

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserProfile {
  id: string; // UUID de auth.users
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

// ==========================================
// 2. Tablas / Entidades de Base de Datos
// ==========================================

export interface CuentaBancaria {
  id: number;
  nombre: string;
  banco: string;
  numero: string;
  tipo_cuenta?: string;
  saldo: number;
  activa: boolean;
  created_at?: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  contacto: string | null;
  activo: boolean;
  created_at: string;
}

export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

export interface Factura {
  id: number;
  cliente_id: number;
  numero: string;
  fecha_emision: string; // ISO Date YYYY-MM-DD
  fecha_vencimiento: string; // ISO Date YYYY-MM-DD
  fecha_estimada_recaudo: string; // ISO Date YYYY-MM-DD
  valor: number;
  estado: EstadoFactura;
  created_at: string;
}

export interface Semana {
  id: number;
  numero: number;
  anio: number;
  fecha_inicio: string; // ISO Date YYYY-MM-DD
  fecha_fin: string; // ISO Date YYYY-MM-DD
}

export interface SaldoSemanal {
  id: number;
  semana_id: number;
  cuenta_id: number;
  saldo: number;
}

export interface Recaudo {
  id: number;
  semana_id: number;
  factura_id: number;
  valor: number;
  fecha: string; // ISO Date YYYY-MM-DD
  created_at: string;
}

export type TipoCategoriaEgreso = 'terceros' | 'socios' | 'financieros';

export interface CategoriaEgreso {
  id: number;
  nombre: string;
  tipo: TipoCategoriaEgreso;
  activa: boolean;
}

export interface Egreso {
  id: number;
  semana_id: number;
  categoria_id: number;
  valor: number;
  descripcion: string | null;
  created_at: string;
}

export type FrecuenciaEgreso = 'semanal' | 'quincenal' | 'mensual' | 'semestral' | 'anual';

export interface EgresoRecurrente {
  id: number;
  categoria_id: number;
  tercero: string;
  frecuencia: FrecuenciaEgreso;
  dia_pago: number; // 1-31 para mensual, 1-7 para semanal, o codificación MMDD
  monto_estimado: number;
  activa: boolean;
  created_at: string;
}

export type PrioridadCompromiso = 'alta' | 'media' | 'baja';
export type EstadoCompromiso = 'pendiente' | 'pagado' | 'vencido';

export interface Compromiso {
  id: number;
  tercero: string;
  descripcion: string | null;
  fecha: string; // ISO Date YYYY-MM-DD
  valor: number;
  prioridad: PrioridadCompromiso;
  estado: EstadoCompromiso;
  created_at: string;
}

export interface SnapshotProyeccion {
  id: number;
  semana_id: number;
  recaudo_estimado: number;
  egresos_estimado: number;
  saldo_final_estimado: number;
  congelado_at: string;
}

export interface Importacion {
  id: number;
  archivo: string;
  fecha: string;
  hojas: string | null;
  registros: number;
  exitosa: boolean;
}

export interface SiigoSyncLog {
  id: number;
  fecha: string;
  clientes_creados: number;
  facturas_creadas: number;
  facturas_actualizadas: number;
  exitosa: boolean;
  error_message: string | null;
  usuario_id: string | null;
}

// ==========================================
// 3. Entidades Extendidas con Relaciones (UI / Vistas)
// ==========================================

export interface FacturaConCliente extends Factura {
  cliente?: Cliente;
  recaudos?: Recaudo[];
  total_recaudado?: number;
  saldo_pendiente?: number;
}

export interface RecaudoConFactura extends Recaudo {
  factura?: FacturaConCliente;
  semana?: Semana;
}

export interface EgresoConCategoria extends Egreso {
  categoria?: CategoriaEgreso;
  semana?: Semana;
}

export interface SaldoSemanalConCuenta extends SaldoSemanal {
  cuenta?: CuentaBancaria;
  semana?: Semana;
}

export interface EgresoRecurrenteConCategoria extends EgresoRecurrente {
  categoria?: CategoriaEgreso;
}

// ==========================================
// 4. Modelos del Motor de Proyección Financiera
// ==========================================

export interface ProyeccionSemanal {
  semana_id: number;
  semana: number;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  saldo_inicial: number;
  recaudo: number;
  recaudo_real: number;
  recaudo_proyectado: number;
  egresos: number;
  egresos_real: number;
  egresos_recurrente: number;
  compromisos: number;
  saldo_final: number;
  deficit: boolean;
}

export interface CalibracionProyeccion {
  semana: number;
  anio: number;
  fecha_inicio: string;
  recaudo_estimado: number;
  recaudo_real: number;
  recaudo_desvio: number;
  egresos_estimado: number;
  egresos_real: number;
  egresos_desvio: number;
  saldo_estimado: number;
  saldo_real: number;
  saldo_desvio: number;
}

export interface SaldoPorCuenta {
  cuenta_id: number;
  nombre: string;
  banco: string;
  numero: string;
  saldo: number;
}

export interface DetalleFacturaPendienteCliente {
  numero: string;
  valor: number;
  pendiente: number;
}

export interface RecaudoPendienteCliente {
  cliente: string;
  facturas: DetalleFacturaPendienteCliente[];
  total_pendiente: number;
}

export interface ResumenDashboard {
  saldo_actual: number;
  recaudo_mes_proyectado: number;
  egresos_mes_proyectado: number;
  compromisos_pendientes_count: number;
  semanas_deficit_count: number;
  proyecciones: ProyeccionSemanal[];
  alertas: ProyeccionSemanal[];
}

// ==========================================
// 5. DTOs de Entrada / Mutación (Formularios y API)
// ==========================================

export type CrearFacturaInput = Omit<Factura, 'id' | 'created_at'>;
export type ActualizarFacturaInput = Partial<CrearFacturaInput>;

export type RegistrarRecaudoInput = Omit<Recaudo, 'id' | 'created_at'>;

export type CrearClienteInput = Omit<Cliente, 'id' | 'created_at'>;
export type ActualizarClienteInput = Partial<CrearClienteInput>;

export type CrearCompromisoInput = Omit<Compromiso, 'id' | 'created_at'>;
export type ActualizarCompromisoInput = Partial<CrearCompromisoInput>;

export type CrearEgresoRecurrenteInput = Omit<EgresoRecurrente, 'id' | 'created_at'>;
export type ActualizarEgresoRecurrenteInput = Partial<CrearEgresoRecurrenteInput>;

export type RegistrarSaldoSemanalInput = Omit<SaldoSemanal, 'id'>;
export type RegistrarEgresoInput = Omit<Egreso, 'id' | 'created_at'>;

export interface FiltrosFactura {
  estado?: EstadoFactura;
  cliente_id?: number;
  busqueda?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}

// ==========================================
// 6. Integración API SIIGO Colombia
// ==========================================

export interface SiigoCredentials {
  username: string;
  access_key: string;
  partner_id: string;
  base_url?: string;
}

export interface SiigoAuthResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

export interface SiigoCustomer {
  identification: string;
  name: string | string[];
  phone?: string;
  email?: string;
}

export interface SiigoInvoiceDue {
  date: string;
  balance: number;
}

export interface SiigoInvoice {
  id: string;
  prefix?: string;
  number: number | string;
  name?: string;
  date: string;
  customer: SiigoCustomer;
  total: number;
  due: SiigoInvoiceDue;
}

export interface SiigoSyncStats {
  clientes_creados: number;
  facturas_creadas: number;
  facturas_actualizadas: number;
  exitosa: boolean;
  error?: string;
  facturas_detalle?: Array<{
    numero: string;
    cliente_nombre: string;
    valor: number;
    saldo_pendiente: number;
    estado: string;
    fecha_vencimiento: string;
  }>;
}
