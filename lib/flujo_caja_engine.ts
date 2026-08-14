import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EgresoRecurrente,
  Semana,
  ProyeccionSemanal,
  CalibracionProyeccion,
  SaldoPorCuenta,
  RecaudoPendienteCliente,
} from '../types/flujo_caja';

/**
 * Calcula la semana ISO de una fecha dada.
 */
export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNo = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
  return { week: weekNo, year: date.getUTCFullYear() };
}

/**
 * Genera semanas futuras en la base de datos si no existen, empezando desde la semana ISO actual.
 */
export async function generarSemanasFuturas(
  supabaseClient: unknown,
  n: number = 12
): Promise<void> {
  const supabase = supabaseClient as SupabaseClient;
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  for (let i = 0; i < n; i++) {
    const fechaInicio = new Date(monday);
    fechaInicio.setDate(monday.getDate() + i * 7);

    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaInicio.getDate() + 6);

    const { week, year } = getISOWeekAndYear(fechaInicio);
    const fechaInicioStr = fechaInicio.toISOString().split('T')[0];
    const fechaFinStr = fechaFin.toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('semanas')
      .select('id')
      .eq('anio', year)
      .eq('numero', week)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('semanas').insert({
        numero: week,
        anio: year,
        fecha_inicio: fechaInicioStr,
        fecha_fin: fechaFinStr,
      });
    }
  }
}

/**
 * Evalúa si un egreso recurrente aplica dentro de un rango de fechas semanal.
 */
export function evaluarRecurrencia(
  rec: EgresoRecurrente,
  inicioStr: string,
  finStr: string
): boolean {
  const inicio = new Date(inicioStr + 'T00:00:00');
  const fin = new Date(finStr + 'T00:00:00');

  const frecuencia = rec.frecuencia;
  const diaPago = rec.dia_pago;

  if (frecuencia === 'semanal') {
    return true;
  }

  if (frecuencia === 'quincenal') {
    const curr = new Date(inicio);
    while (curr <= fin) {
      if (curr.getDate() === 15) {
        return true;
      }
      const nextDay = new Date(curr);
      nextDay.setDate(curr.getDate() + 1);
      if (nextDay.getMonth() !== curr.getMonth()) {
        return true;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return false;
  }

  if (frecuencia === 'mensual') {
    const curr = new Date(inicio);
    while (curr <= fin) {
      if (curr.getDate() === diaPago) {
        return true;
      }
      const nextDay = new Date(curr);
      nextDay.setDate(curr.getDate() + 1);
      if (nextDay.getMonth() !== curr.getMonth() && diaPago > curr.getDate()) {
        return true;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return false;
  }

  if (frecuencia === 'semestral') {
    const mesInicio = Math.floor(diaPago / 100);
    const dia = diaPago % 100;
    let mesSegundo = mesInicio + 6;
    if (mesSegundo > 12) {
      mesSegundo -= 12;
    }

    const curr = new Date(inicio);
    while (curr <= fin) {
      const month = curr.getMonth() + 1;
      if (
        curr.getDate() === dia &&
        (month === mesInicio || month === mesSegundo)
      ) {
        return true;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return false;
  }

  if (frecuencia === 'anual') {
    const mes = Math.floor(diaPago / 100);
    const dia = diaPago % 100;

    const curr = new Date(inicio);
    while (curr <= fin) {
      const month = curr.getMonth() + 1;
      if (curr.getDate() === dia && month === mes) {
        return true;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return false;
  }

  return false;
}

/**
 * Calcula la proyección de flujo de caja semana a semana para las próximas N semanas.
 * Optimizado mediante Bulk Query Batching en paralelo (Promise.all)
 * e indexación en memoria con Map/Set para cálculos sub-milisegundo.
 */
export async function calcularProyeccionFlujoCaja(
  supabaseClient: unknown,
  semanas: number = 12
): Promise<ProyeccionSemanal[]> {
  const supabase = supabaseClient as SupabaseClient;
  const hoyStr = new Date().toISOString().split('T')[0];

  // Obtener semanas futuras ordenadas por fecha de inicio
  const { data: semanasData, error: errSemanas } = await supabase
    .from('semanas')
    .select('*')
    .gte('fecha_inicio', hoyStr)
    .order('fecha_inicio', { ascending: true })
    .limit(semanas);

  if (errSemanas) {
    console.error('Error al consultar semanas:', errSemanas);
    throw errSemanas;
  }

  if (!semanasData || semanasData.length === 0) {
    return [];
  }

  const semanaList = semanasData as Semana[];
  const semanaIds = semanaList.map((s) => s.id);
  const minFecha = semanaList[0].fecha_inicio;
  const maxFecha = semanaList[semanaList.length - 1].fecha_fin;

  // Consultas masivas en paralelo (Bulk Fetching)
  const [
    facturasRes,
    recaudosRes,
    egresosRes,
    compromisosRes,
    saldosRes,
    recurrentesRes,
  ] = await Promise.all([
    supabase
      .from('facturas')
      .select('id, valor, fecha_estimada_recaudo, estado, recaudos(valor)')
      .in('estado', ['pendiente', 'parcial']),
    supabase
      .from('recaudos')
      .select('id, valor, semana_id, factura_id')
      .in('semana_id', semanaIds),
    supabase
      .from('egresos')
      .select('id, valor, semana_id, categoria_id')
      .in('semana_id', semanaIds),
    supabase
      .from('compromisos')
      .select('id, valor, fecha, estado')
      .eq('estado', 'pendiente')
      .gte('fecha', minFecha)
      .lte('fecha', maxFecha),
    supabase
      .from('saldos_semanales')
      .select('id, saldo, semana_id')
      .in('semana_id', semanaIds),
    supabase
      .from('egresos_recurrentes')
      .select('*')
      .eq('activa', true),
  ]);

  if (facturasRes.error) {
    console.error('Error al consultar facturas:', facturasRes.error);
    throw facturasRes.error;
  }
  if (recaudosRes.error) {
    console.error('Error al consultar recaudos:', recaudosRes.error);
    throw recaudosRes.error;
  }
  if (egresosRes.error) {
    console.error('Error al consultar egresos:', egresosRes.error);
    throw egresosRes.error;
  }
  if (compromisosRes.error) {
    console.error('Error al consultar compromisos:', compromisosRes.error);
    throw compromisosRes.error;
  }
  if (saldosRes.error) {
    console.error('Error al consultar saldos_semanales:', saldosRes.error);
    throw saldosRes.error;
  }
  if (recurrentesRes.error) {
    console.error('Error al consultar egresos recurrentes:', recurrentesRes.error);
    throw recurrentesRes.error;
  }

  // 1. Indexación en memoria: Saldos iniciales por semana_id
  const saldosPorSemanaMap = new Map<number, number>();
  for (const s of (saldosRes.data || []) as Array<{ saldo?: number | string; semana_id?: number }>) {
    const semId = Number(s.semana_id);
    saldosPorSemanaMap.set(
      semId,
      (saldosPorSemanaMap.get(semId) || 0) + Number(s.saldo || 0)
    );
  }

  // 2. Indexación en memoria: Recaudos reales por semana_id y recaudos por factura_id
  const recaudosPorSemanaMap = new Map<number, number>();
  const recaudosPorFacturaMap = new Map<number, number>();
  for (const r of (recaudosRes.data || []) as Array<{ valor?: number | string; semana_id?: number; factura_id?: number }>) {
    if (r.semana_id !== undefined && r.semana_id !== null) {
      const semId = Number(r.semana_id);
      recaudosPorSemanaMap.set(
        semId,
        (recaudosPorSemanaMap.get(semId) || 0) + Number(r.valor || 0)
      );
    }
    if (r.factura_id !== undefined && r.factura_id !== null) {
      const fId = Number(r.factura_id);
      recaudosPorFacturaMap.set(
        fId,
        (recaudosPorFacturaMap.get(fId) || 0) + Number(r.valor || 0)
      );
    }
  }

  // 3. Indexación en memoria: Facturas pendientes
  const facturasMap = new Map<
    number,
    { fechaEst: string; pendiente: number }
  >();
  for (const f of (facturasRes.data || []) as Array<{
    id: number;
    valor: number | string;
    fecha_estimada_recaudo: string;
    estado: string;
    recaudos?: Array<{ valor?: number | string }>;
  }>) {
    const recaudosList = f.recaudos;
    const totalRecaudado = Array.isArray(recaudosList)
      ? recaudosList.reduce(
          (acc: number, r: { valor?: number | string }) => acc + Number(r.valor || 0),
          0
        )
      : (recaudosPorFacturaMap.get(f.id) || 0);

    const pendiente = Number(f.valor || 0) - totalRecaudado;
    if (pendiente > 0) {
      facturasMap.set(f.id, {
        fechaEst: f.fecha_estimada_recaudo,
        pendiente,
      });
    }
  }

  // 4. Indexación en memoria: Egresos reales por semana_id y categorías
  const egresosPorSemanaMap = new Map<number, number>();
  const egresosCategoriasPorSemanaMap = new Map<number, Set<number>>();
  for (const e of (egresosRes.data || []) as Array<{
    valor?: number | string;
    semana_id?: number;
    categoria_id?: number;
  }>) {
    const semId = Number(e.semana_id);
    const catId = Number(e.categoria_id);
    const val = Number(e.valor || 0);

    egresosPorSemanaMap.set(
      semId,
      (egresosPorSemanaMap.get(semId) || 0) + val
    );

    if (!egresosCategoriasPorSemanaMap.has(semId)) {
      egresosCategoriasPorSemanaMap.set(semId, new Set<number>());
    }
    egresosCategoriasPorSemanaMap.get(semId)!.add(catId);
  }

  // 5. Compromisos en memoria
  const compromisosList = (compromisosRes.data || []) as Array<{
    valor?: number | string;
    fecha?: string;
  }>;

  // 6. Egresos recurrentes activos
  const recurrentes: EgresoRecurrente[] = (recurrentesRes.data || []) as EgresoRecurrente[];

  // ── Cálculo Secuencial de Proyecciones en Memoria ──
  const resultado: ProyeccionSemanal[] = [];
  let saldoAcumulado: number | null = null;
  let primeraSemana = true;

  for (const sem of semanaList) {
    const semanaId = sem.id;
    const fechaInicioStr = sem.fecha_inicio;
    const fechaFinStr = sem.fecha_fin;

    // Saldo inicial de la semana
    let saldoInicial = 0;
    if (saldoAcumulado === null) {
      saldoInicial = saldosPorSemanaMap.get(semanaId) || 0;
    } else {
      saldoInicial = saldoAcumulado;
    }

    // ── RECAUDOS DE LA SEMANA ──
    // A. Recaudos reales
    const recaudosReales = recaudosPorSemanaMap.get(semanaId) || 0;

    // B. Recaudos proyectados de facturas pendientes
    let recaudosProyectados = 0;
    const idsToRemove: number[] = [];

    facturasMap.forEach((fData, fId) => {
      const fDate = fData.fechaEst;
      if (
        (fDate >= fechaInicioStr && fDate <= fechaFinStr) ||
        (primeraSemana && fDate < fechaInicioStr)
      ) {
        recaudosProyectados += fData.pendiente;
        idsToRemove.push(fId);
      }
    });

    idsToRemove.forEach((id) => facturasMap.delete(id));

    const totalRecaudo = recaudosReales + recaudosProyectados;

    // ── EGRESOS DE LA SEMANA ──
    // A. Egresos reales
    const totalEgresosReales = egresosPorSemanaMap.get(semanaId) || 0;
    const categoriasConEgresoReal =
      egresosCategoriasPorSemanaMap.get(semanaId) || new Set<number>();

    // B. Egresos proyectados recurrentes (se omiten si ya existe un egreso real de esa categoría)
    let totalEgresosRecurrentes = 0;
    for (const rec of recurrentes) {
      if (!categoriasConEgresoReal.has(rec.categoria_id)) {
        if (evaluarRecurrencia(rec, fechaInicioStr, fechaFinStr)) {
          totalEgresosRecurrentes += Number(rec.monto_estimado);
        }
      }
    }

    // C. Compromisos pendientes en el rango de fechas de la semana
    let totalCompromisos = 0;
    for (const c of compromisosList) {
      const cFecha = c.fecha || '';
      if (cFecha >= fechaInicioStr && cFecha <= fechaFinStr) {
        totalCompromisos += Number(c.valor || 0);
      }
    }

    const totalEgresos =
      totalEgresosReales + totalEgresosRecurrentes + totalCompromisos;
    const saldoFinal = saldoInicial + totalRecaudo - totalEgresos;
    const deficit = saldoFinal < 0;

    resultado.push({
      semana_id: semanaId,
      semana: sem.numero,
      anio: sem.anio,
      fecha_inicio: sem.fecha_inicio,
      fecha_fin: sem.fecha_fin,
      saldo_inicial: saldoInicial,
      recaudo: totalRecaudo,
      recaudo_real: recaudosReales,
      recaudo_proyectado: recaudosProyectados,
      egresos: totalEgresos,
      egresos_real: totalEgresosReales,
      egresos_recurrente: totalEgresosRecurrentes,
      compromisos: totalCompromisos,
      saldo_final: saldoFinal,
      deficit,
    });

    saldoAcumulado = saldoFinal;
    primeraSemana = false;
  }

  return resultado;
}

/**
 * Guarda/congela la estimación proyectada para una semana en snapshots_proyeccion.
 */
export async function guardarSnapshotProyeccion(
  supabaseClient: unknown,
  semanaId: number,
  recaudoEst: number,
  egresosEst: number,
  saldoEst: number
): Promise<void> {
  const supabase = supabaseClient as SupabaseClient;
  const congeladoAt = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('snapshots_proyeccion')
    .upsert({
      semana_id: semanaId,
      recaudo_estimado: recaudoEst,
      egresos_estimado: egresosEst,
      saldo_final_estimado: saldoEst,
      congelado_at: congeladoAt,
    });

  if (error) {
    console.error('Error al guardar snapshot de proyección:', error);
    throw error;
  }
}

/**
 * Compara las estimaciones congeladas históricas contra los resultados reales.
 * Optimizado con bulk queries en paralelo para evitar N+1 queries.
 */
export async function obtenerCalibracionProyeccion(
  supabaseClient: unknown,
  limiteSemanas: number = 4
): Promise<CalibracionProyeccion[]> {
  const supabase = supabaseClient as SupabaseClient;
  const { data: snapshotsData, error } = await supabase
    .from('snapshots_proyeccion')
    .select('*, semanas(*)')
    .order('congelado_at', { ascending: false })
    .limit(limiteSemanas);

  if (error) {
    console.error('Error obteniendo snapshots:', error);
    throw error;
  }

  if (!snapshotsData || snapshotsData.length === 0) {
    return [];
  }

  const snapSemanaIds = snapshotsData.map((s) => s.semana_id);

  // Bulk queries en paralelo
  const [recaudosRes, egresosRes, saldosRes] = await Promise.all([
    supabase
      .from('recaudos')
      .select('valor, semana_id')
      .in('semana_id', snapSemanaIds),
    supabase
      .from('egresos')
      .select('valor, semana_id')
      .in('semana_id', snapSemanaIds),
    supabase
      .from('saldos_semanales')
      .select('saldo, semana_id')
      .in('semana_id', snapSemanaIds),
  ]);

  if (recaudosRes.error) throw recaudosRes.error;
  if (egresosRes.error) throw egresosRes.error;
  if (saldosRes.error) throw saldosRes.error;

  const recaudosMap = new Map<number, number>();
  for (const r of (recaudosRes.data || []) as Array<{ valor?: number | string; semana_id?: number }>) {
    const semId = Number(r.semana_id);
    recaudosMap.set(semId, (recaudosMap.get(semId) || 0) + Number(r.valor || 0));
  }

  const egresosMap = new Map<number, number>();
  for (const e of (egresosRes.data || []) as Array<{ valor?: number | string; semana_id?: number }>) {
    const semId = Number(e.semana_id);
    egresosMap.set(semId, (egresosMap.get(semId) || 0) + Number(e.valor || 0));
  }

  const saldosMap = new Map<number, number>();
  for (const s of (saldosRes.data || []) as Array<{ saldo?: number | string; semana_id?: number }>) {
    const semId = Number(s.semana_id);
    saldosMap.set(semId, (saldosMap.get(semId) || 0) + Number(s.saldo || 0));
  }

  const resultado: CalibracionProyeccion[] = [];

  for (const snap of snapshotsData) {
    const semana = snap.semanas;
    const semanaId = snap.semana_id;

    const realRecaudo = recaudosMap.get(semanaId) || 0;
    const realEgresos = egresosMap.get(semanaId) || 0;
    const saldoInicialReal = saldosMap.get(semanaId) || 0;

    const realSaldoFinal = saldoInicialReal + realRecaudo - realEgresos;

    const recaudoEst = Number(snap.recaudo_estimado);
    const egresosEst = Number(snap.egresos_estimado);
    const saldoEst = Number(snap.saldo_final_estimado);

    resultado.push({
      semana: semana?.numero || 0,
      anio: semana?.anio || 0,
      fecha_inicio: semana?.fecha_inicio || '',
      recaudo_estimado: recaudoEst,
      recaudo_real: realRecaudo,
      recaudo_desvio: realRecaudo - recaudoEst,
      egresos_estimado: egresosEst,
      egresos_real: realEgresos,
      egresos_desvio: realEgresos - egresosEst,
      saldo_estimado: saldoEst,
      saldo_real: realSaldoFinal,
      saldo_desvio: realSaldoFinal - saldoEst,
    });
  }

  return resultado;
}

/**
 * Retorna saldo por cuenta bancaria para una semana dada.
 */
export async function obtenerSaldoPorCuenta(
  supabaseClient: unknown,
  semanaId: number
): Promise<SaldoPorCuenta[]> {
  const supabase = supabaseClient as SupabaseClient;
  const { data, error } = await supabase
    .from('saldos_semanales')
    .select('saldo, cuenta_id, cuentas_bancarias(nombre, banco, numero)')
    .eq('semana_id', semanaId);

  if (error) {
    console.error('Error al obtener saldos por cuenta:', error);
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map((r: Record<string, unknown>) => {
    const cuenta = (r.cuentas_bancarias as Record<string, string>) || {};
    return {
      cuenta_id: Number(r.cuenta_id || 0),
      nombre: cuenta.nombre || 'N/A',
      banco: cuenta.banco || 'N/A',
      numero: cuenta.numero || 'N/A',
      saldo: Number(r.saldo || 0),
    };
  });
}

/**
 * Retorna recaudo pendiente agrupado por cliente.
 */
export async function obtenerRecaudoPendienteCliente(
  supabaseClient: unknown
): Promise<RecaudoPendienteCliente[]> {
  const supabase = supabaseClient as SupabaseClient;
  const { data: facturasData, error } = await supabase
    .from('facturas')
    .select('id, numero, valor, estado, clientes(nombre), recaudos(valor)')
    .in('estado', ['pendiente', 'parcial']);

  if (error) {
    console.error('Error al obtener recaudo pendiente:', error);
    throw error;
  }

  if (!facturasData) {
    return [];
  }

  const clientesMap = new Map<string, RecaudoPendienteCliente>();

  for (const f of facturasData) {
    const clientesObj = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
    const clienteNombre = (clientesObj as { nombre?: string })?.nombre || 'Desconocido';

    if (!clientesMap.has(clienteNombre)) {
      clientesMap.set(clienteNombre, {
        cliente: clienteNombre,
        facturas: [],
        total_pendiente: 0,
      });
    }

    const valor = Number(f.valor);
    const recaudosList = f.recaudos || [];
    const totalRecaudado = Array.isArray(recaudosList)
      ? recaudosList.reduce((acc: number, r: Record<string, unknown>) => acc + Number(r.valor), 0)
      : 0;

    const pendiente = Math.max(valor - totalRecaudado, 0);

    const clientObj = clientesMap.get(clienteNombre)!;
    clientObj.facturas.push({
      numero: f.numero,
      valor,
      pendiente,
    });
    clientObj.total_pendiente += pendiente;
  }

  return Array.from(clientesMap.values());
}

/**
 * Retorna semanas donde el saldo proyectado es negativo (déficit).
 */
export async function obtenerAlertasDeficit(
  supabaseClient: unknown
): Promise<ProyeccionSemanal[]> {
  const proyeccion = await calcularProyeccionFlujoCaja(supabaseClient, 12);
  return proyeccion.filter((p) => p.deficit);
}
