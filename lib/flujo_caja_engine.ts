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
 * Calcula la proyección de flujo de caja semana a semana para las próximas N semanas (SSOT).
 * Incluye obligaciones (cuentas por pagar), recaudos proyectados de facturas,
 * egresos recurrentes y saldo inicial derivado de cuentas bancarias.
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

  // Consultas masivas en paralelo (Bulk Fetching SSOT)
  const [
    facturasRes,
    recaudosRes,
    egresosRes,
    obligacionesRes,
    compromisosRes,
    saldosRes,
    cuentasRes,
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
      .from('obligaciones')
      .select('id, tercero, concepto, saldo_pendiente, fecha_programada_pago, fecha_vencimiento, estado')
      .in('estado', ['pendiente', 'parcial', 'reprogramada', 'vencida']),
    supabase
      .from('compromisos')
      .select('id, valor, fecha, estado')
      .eq('estado', 'pendiente'),
    supabase
      .from('saldos_semanales')
      .select('id, saldo, semana_id')
      .in('semana_id', semanaIds),
    supabase
      .from('cuentas_bancarias')
      .select('saldo')
      .eq('activa', true),
    supabase
      .from('egresos_recurrentes')
      .select('*')
      .eq('activa', true),
  ]);

  // 1. Saldo inicial base desde cuentas bancarias activas
  let saldoCuentasInicial = 0;
  if (cuentasRes.data && cuentasRes.data.length > 0) {
    saldoCuentasInicial = cuentasRes.data.reduce(
      (acc: number, c: { saldo?: number | string }) => acc + Number(c.saldo || 0),
      0
    );
  } else if (saldosRes.data && saldosRes.data.length > 0) {
    saldoCuentasInicial = saldosRes.data.reduce(
      (acc: number, s: { saldo?: number | string }) => acc + Number(s.saldo || 0),
      0
    );
  }

  // 2. Indexación en memoria: Recaudos reales por semana_id
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

  // 4. Indexación en memoria: Egresos reales por semana_id
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

  // 5. Indexación en memoria: Obligaciones (Cuentas por Pagar SSOT)
  const obligacionesList = (obligacionesRes.data || []) as Array<{
    id: number;
    saldo_pendiente?: number | string;
    fecha_programada_pago?: string;
    fecha_vencimiento?: string;
    estado?: string;
  }>;

  // Fallback compromisos legacy
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
      saldoInicial = saldoCuentasInicial;
    } else {
      saldoInicial = saldoAcumulado;
    }

    // ── RECAUDOS DE LA SEMANA ──
    const recaudosReales = recaudosPorSemanaMap.get(semanaId) || 0;
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
    const totalEgresosReales = egresosPorSemanaMap.get(semanaId) || 0;
    const categoriasConEgresoReal =
      egresosCategoriasPorSemanaMap.get(semanaId) || new Set<number>();

    // Egresos proyectados recurrentes
    let totalEgresosRecurrentes = 0;
    for (const rec of recurrentes) {
      if (!categoriasConEgresoReal.has(rec.categoria_id)) {
        if (evaluarRecurrencia(rec, fechaInicioStr, fechaFinStr)) {
          totalEgresosRecurrentes += Number(rec.monto_estimado);
        }
      }
    }

    // Obligaciones (Cuentas por Pagar SSOT) asignadas a la semana
    let totalObligacionesSemana = 0;
    for (const ob of obligacionesList) {
      const fechaPago = ob.fecha_programada_pago || ob.fecha_vencimiento || '';
      const pendiente = Number(ob.saldo_pendiente || 0);

      if (
        (fechaPago >= fechaInicioStr && fechaPago <= fechaFinStr) ||
        (primeraSemana && fechaPago < fechaInicioStr)
      ) {
        totalObligacionesSemana += pendiente;
      }
    }

    // Fallback compromisos
    if (totalObligacionesSemana === 0) {
      for (const c of compromisosList) {
        const cFecha = c.fecha || '';
        if (
          (cFecha >= fechaInicioStr && cFecha <= fechaFinStr) ||
          (primeraSemana && cFecha < fechaInicioStr)
        ) {
          totalObligacionesSemana += Number(c.valor || 0);
        }
      }
    }

    const totalEgresos = totalEgresosReales + totalEgresosRecurrentes + totalObligacionesSemana;
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
      compromisos: totalObligacionesSemana,
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
  saldoFinalEst: number
): Promise<void> {
  const supabase = supabaseClient as SupabaseClient;

  const { error } = await supabase.from('snapshots_proyeccion').upsert(
    {
      semana_id: semanaId,
      recaudo_estimado: recaudoEst,
      egresos_estimado: egresosEst,
      saldo_final_estimado: saldoFinalEst,
      congelado_at: new Date().toISOString(),
    },
    { onConflict: 'semana_id' }
  );

  if (error) {
    console.error('Error al guardar snapshot de proyección:', error);
    throw error;
  }
}

/**
 * Compara los resultados proyectados congelados con los reales acumulados.
 */
export async function obtenerCalibracionProyeccion(
  supabaseClient: unknown,
  n: number = 6
): Promise<CalibracionProyeccion[]> {
  const supabase = supabaseClient as SupabaseClient;

  const { data: snapshots, error: errSnapshots } = await supabase
    .from('snapshots_proyeccion')
    .select('*, semanas!inner(numero, anio, fecha_inicio)')
    .order('semana_id', { ascending: false })
    .limit(n);

  if (errSnapshots) {
    console.error('Error al obtener snapshots de proyección:', errSnapshots);
    throw errSnapshots;
  }

  if (!snapshots || snapshots.length === 0) {
    return [];
  }

  const calibraciones: CalibracionProyeccion[] = [];

  for (const snap of snapshots) {
    const semId = snap.semana_id;
    const semInfo = snap.semanas as unknown as { numero: number; anio: number; fecha_inicio: string };

    const { data: recData } = await supabase
      .from('recaudos')
      .select('valor')
      .eq('semana_id', semId);

    const recaudoReal = (recData || []).reduce(
      (sum: number, r: { valor: number }) => sum + Number(r.valor || 0),
      0
    );

    const { data: egrData } = await supabase
      .from('egresos')
      .select('valor')
      .eq('semana_id', semId);

    const egresosReal = (egrData || []).reduce(
      (sum: number, e: { valor: number }) => sum + Number(e.valor || 0),
      0
    );

    const { data: saldosData } = await supabase
      .from('saldos_semanales')
      .select('saldo')
      .eq('semana_id', semId);

    const saldoReal = (saldosData || []).reduce(
      (sum: number, s: { saldo: number }) => sum + Number(s.saldo || 0),
      0
    );

    const recaudoEst = Number(snap.recaudo_estimado || 0);
    const egresosEst = Number(snap.egresos_estimado || 0);
    const saldoEst = Number(snap.saldo_final_estimado || 0);

    calibraciones.push({
      semana: semInfo.numero,
      anio: semInfo.anio,
      fecha_inicio: semInfo.fecha_inicio,
      recaudo_estimado: recaudoEst,
      recaudo_real: recaudoReal,
      recaudo_desvio: recaudoReal - recaudoEst,
      egresos_estimado: egresosEst,
      egresos_real: egresosReal,
      egresos_desvio: egresosReal - egresosEst,
      saldo_estimado: saldoEst,
      saldo_real: saldoReal,
      saldo_desvio: saldoReal - saldoEst,
    });
  }

  return calibraciones;
}

/**
 * Consulta los saldos reales actuales desglosados por cuenta bancaria.
 */
export async function obtenerSaldoPorCuenta(
  supabaseClient: unknown
): Promise<SaldoPorCuenta[]> {
  const supabase = supabaseClient as SupabaseClient;

  const { data: cuentas, error: errCuentas } = await supabase
    .from('cuentas_bancarias')
    .select('id, nombre, banco, numero, saldo')
    .eq('activa', true)
    .order('nombre', { ascending: true });

  if (errCuentas) {
    console.error('Error al obtener saldos por cuenta:', errCuentas);
    throw errCuentas;
  }

  return (cuentas || []).map((c) => ({
    cuenta_id: c.id,
    nombre: c.nombre,
    banco: c.banco,
    numero: c.numero,
    saldo: Number(c.saldo || 0),
  }));
}

/**
 * Obtiene el detalle de recaudos pendientes agrupados por cliente.
 */
export async function obtenerRecaudoPendienteCliente(
  supabaseClient: unknown
): Promise<RecaudoPendienteCliente[]> {
  const supabase = supabaseClient as SupabaseClient;

  const { data: facturas, error: errFacturas } = await supabase
    .from('facturas')
    .select('numero, valor, clientes(nombre), recaudos(valor)')
    .in('estado', ['pendiente', 'parcial']);

  if (errFacturas) {
    console.error('Error al obtener recaudos pendientes por cliente:', errFacturas);
    throw errFacturas;
  }

  const clienteMap = new Map<string, RecaudoPendienteCliente>();

  for (const f of facturas || []) {
    const clienteNombre =
      (f.clientes as unknown as { nombre: string })?.nombre || 'Cliente Desconocido';

    const totalRecaudado = (
      (f.recaudos as unknown as Array<{ valor: number }>) || []
    ).reduce((sum, r) => sum + Number(r.valor || 0), 0);

    const pendiente = Number(f.valor || 0) - totalRecaudado;

    if (pendiente > 0) {
      if (!clienteMap.has(clienteNombre)) {
        clienteMap.set(clienteNombre, {
          cliente: clienteNombre,
          facturas: [],
          total_pendiente: 0,
        });
      }

      const item = clienteMap.get(clienteNombre)!;
      item.facturas.push({
        numero: f.numero,
        valor: Number(f.valor || 0),
        pendiente,
      });
      item.total_pendiente += pendiente;
    }
  }

  return Array.from(clienteMap.values()).sort(
    (a, b) => b.total_pendiente - a.total_pendiente
  );
}

/**
 * Retorna las semanas proyectadas que presenten un saldo final negativo (déficit de liquidez).
 */
export async function obtenerAlertasDeficit(
  supabaseClient: unknown,
  semanas: number = 12
): Promise<ProyeccionSemanal[]> {
  const proyecciones = await calcularProyeccionFlujoCaja(supabaseClient, semanas);
  return proyecciones.filter((p) => p.deficit);
}
