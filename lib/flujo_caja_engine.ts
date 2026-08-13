/**
 * Motor de proyección de flujo de caja semanal para Next.js / Node.js
 * Portado desde core/proyeccion.py
 */

import type {
  ProyeccionSemanal,
  CalibracionProyeccion,
  SaldoPorCuenta,
  RecaudoPendienteCliente,
  EgresoRecurrente,
  Semana,
} from '../types/flujo_caja.ts';

/**
 * Obtiene el número de semana ISO y el año para una fecha dada.
 */
export function getISOWeekAndYear(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { week: weekNo, year: date.getUTCFullYear() };
}

/**
 * Genera semanas futuras en la base de datos si no existen, empezando desde la semana ISO actual.
 */
export async function generarSemanasFuturas(
  supabaseClient: any,
  n: number = 12
): Promise<void> {
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

    const { data: existing } = await supabaseClient
      .from('semanas')
      .select('id')
      .eq('anio', year)
      .eq('numero', week)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabaseClient.from('semanas').insert({
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
 */
export async function calcularProyeccionFlujoCaja(
  supabaseClient: any,
  semanas: number = 12
): Promise<ProyeccionSemanal[]> {
  const hoyStr = new Date().toISOString().split('T')[0];

  // Obtener semanas futuras ordenadas por fecha de inicio
  const { data: semanasData, error: errSemanas } = await supabaseClient
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

  // 1. Obtener facturas pendientes o parciales
  const { data: facturasData, error: errFacturas } = await supabaseClient
    .from('facturas')
    .select('id, valor, fecha_estimada_recaudo, estado')
    .in('estado', ['pendiente', 'parcial']);

  if (errFacturas) {
    console.error('Error al consultar facturas:', errFacturas);
    throw errFacturas;
  }

  const facturasMap = new Map<
    number,
    { fechaEst: string; pendiente: number }
  >();

  if (facturasData) {
    for (const f of facturasData) {
      const { data: recaudosData } = await supabaseClient
        .from('recaudos')
        .select('valor')
        .eq('factura_id', f.id);

      const totalRecaudado = recaudosData
        ? recaudosData.reduce(
            (acc: number, r: any) => acc + Number(r.valor),
            0
          )
        : 0;

      const pendiente = Number(f.valor) - totalRecaudado;
      if (pendiente > 0) {
        facturasMap.set(f.id, {
          fechaEst: f.fecha_estimada_recaudo,
          pendiente,
        });
      }
    }
  }

  // 2. Obtener egresos recurrentes activos
  const { data: recurrentesData, error: errRecurrentes } = await supabaseClient
    .from('egresos_recurrentes')
    .select('*')
    .eq('activa', true);

  if (errRecurrentes) {
    console.error('Error al consultar egresos recurrentes:', errRecurrentes);
    throw errRecurrentes;
  }

  const recurrentes: EgresoRecurrente[] = recurrentesData || [];
  const resultado: ProyeccionSemanal[] = [];

  let saldoAcumulado: number | null = null;
  let primeraSemana = true;

  for (const sem of semanasData as Semana[]) {
    const semanaId = sem.id;
    const fechaInicioStr = sem.fecha_inicio;
    const fechaFinStr = sem.fecha_fin;

    // Saldo inicial de la semana
    let saldoInicial = 0;
    if (saldoAcumulado === null) {
      const { data: saldosData } = await supabaseClient
        .from('saldos_semanales')
        .select('saldo')
        .eq('semana_id', semanaId);

      saldoInicial = saldosData
        ? saldosData.reduce((acc: number, s: any) => acc + Number(s.saldo), 0)
        : 0;
    } else {
      saldoInicial = saldoAcumulado;
    }

    // ── RECAUDOS DE LA SEMANA ──
    // A. Recaudos reales
    const { data: recaudosData } = await supabaseClient
      .from('recaudos')
      .select('valor')
      .eq('semana_id', semanaId);

    const recaudosReales = recaudosData
      ? recaudosData.reduce((acc: number, r: any) => acc + Number(r.valor), 0)
      : 0;

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
    const { data: egresosData } = await supabaseClient
      .from('egresos')
      .select('valor, categoria_id')
      .eq('semana_id', semanaId);

    const egresosRealesMap = new Map<number, number>();
    let totalEgresosReales = 0;

    if (egresosData) {
      for (const e of egresosData) {
        const catId = Number(e.categoria_id);
        const val = Number(e.valor);
        egresosRealesMap.set(
          catId,
          (egresosRealesMap.get(catId) || 0) + val
        );
        totalEgresosReales += val;
      }
    }

    // B. Egresos proyectados recurrentes
    let totalEgresosRecurrentes = 0;
    for (const rec of recurrentes) {
      if (!egresosRealesMap.has(rec.categoria_id)) {
        if (evaluarRecurrencia(rec, fechaInicioStr, fechaFinStr)) {
          totalEgresosRecurrentes += Number(rec.monto_estimado);
        }
      }
    }

    // C. Compromisos pendientes
    const { data: compromisosData } = await supabaseClient
      .from('compromisos')
      .select('valor')
      .eq('estado', 'pendiente')
      .gte('fecha', fechaInicioStr)
      .lte('fecha', fechaFinStr);

    const totalCompromisos = compromisosData
      ? compromisosData.reduce(
          (acc: number, c: any) => acc + Number(c.valor),
          0
        )
      : 0;

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
  supabaseClient: any,
  semanaId: number,
  recaudoEst: number,
  egresosEst: number,
  saldoEst: number
): Promise<void> {
  const congeladoAt = new Date().toISOString().split('T')[0];

  const { error } = await supabaseClient
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
 */
export async function obtenerCalibracionProyeccion(
  supabaseClient: any,
  limiteSemanas: number = 4
): Promise<CalibracionProyeccion[]> {
  const { data: snapshotsData, error } = await supabaseClient
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

  const resultado: CalibracionProyeccion[] = [];

  for (const snap of snapshotsData) {
    const semana = snap.semanas;
    const semanaId = snap.semana_id;

    // Recaudos reales
    const { data: recaudosData } = await supabaseClient
      .from('recaudos')
      .select('valor')
      .eq('semana_id', semanaId);

    const realRecaudo = recaudosData
      ? recaudosData.reduce((acc: number, r: any) => acc + Number(r.valor), 0)
      : 0;

    // Egresos reales
    const { data: egresosData } = await supabaseClient
      .from('egresos')
      .select('valor')
      .eq('semana_id', semanaId);

    const realEgresos = egresosData
      ? egresosData.reduce((acc: number, e: any) => acc + Number(e.valor), 0)
      : 0;

    // Saldo inicial real de esa semana
    const { data: saldosData } = await supabaseClient
      .from('saldos_semanales')
      .select('saldo')
      .eq('semana_id', semanaId);

    const saldoInicialReal = saldosData
      ? saldosData.reduce((acc: number, s: any) => acc + Number(s.saldo), 0)
      : 0;

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
  supabaseClient: any,
  semanaId: number
): Promise<SaldoPorCuenta[]> {
  const { data, error } = await supabaseClient
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

  return data.map((r: any) => {
    const cuenta = r.cuentas_bancarias || {};
    return {
      cuenta_id: r.cuenta_id,
      nombre: cuenta.nombre || 'N/A',
      banco: cuenta.banco || 'N/A',
      numero: cuenta.numero || 'N/A',
      saldo: Number(r.saldo),
    };
  });
}

/**
 * Retorna recaudo pendiente agrupado por cliente.
 */
export async function obtenerRecaudoPendienteCliente(
  supabaseClient: any
): Promise<RecaudoPendienteCliente[]> {
  const { data: facturasData, error } = await supabaseClient
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
    const clienteNombre = f.clientes?.nombre || 'Desconocido';

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
      ? recaudosList.reduce((acc: number, r: any) => acc + Number(r.valor), 0)
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
  supabaseClient: any
): Promise<ProyeccionSemanal[]> {
  const proyeccion = await calcularProyeccionFlujoCaja(supabaseClient, 12);
  return proyeccion.filter((p) => p.deficit);
}
