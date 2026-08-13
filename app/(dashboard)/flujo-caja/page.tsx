'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProyeccionSemanal, ResumenDashboard } from '@/types/flujo_caja';
import ChartProyeccion from '@/components/flujo-caja/ChartProyeccion';
import { formatCOP, formatFechaEsp } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { calcularProyeccionFlujoCaja } from '@/lib/flujo_caja_engine';

export default function FlujoCajaDashboardPage() {
  const [proyecciones, setProyecciones] = useState<ProyeccionSemanal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemana, setSelectedSemana] = useState<ProyeccionSemanal | null>(null);

  // Cargar proyección desde Supabase o generar datos demo
  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const data = await calcularProyeccionFlujoCaja(supabase, 12);
        if (data && data.length > 0) {
          setProyecciones(data);
        } else {
          // Si no hay datos en Supabase, usar proyección demo limpia para vista previa
          setProyecciones(generateMockProjections());
        }
      } catch (err) {
        console.warn('Usando proyección demo previa:', err);
        setProyecciones(generateMockProjections());
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Proyección demo de 12 semanas para previsualización inmediata si DB está vacía
  function generateMockProjections(): ProyeccionSemanal[] {
    const mock: ProyeccionSemanal[] = [];
    const baseDate = new Date();
    let saldoAcc = 185_000_000;

    const mockEvents = [
      { rec: 85_000_000, eg: 62_000_000, comp: 15_000_000 },
      { rec: 45_000_000, eg: 70_000_000, comp: 20_000_000 },
      { rec: 30_000_000, eg: 180_000_000, comp: 40_000_000 }, // Deficit
      { rec: 95_000_000, eg: 40_000_000, comp: 10_000_000 },
      { rec: 110_000_000, eg: 55_000_000, comp: 15_000_000 },
      { rec: 50_000_000, eg: 60_000_000, comp: 25_000_000 },
      { rec: 75_000_000, eg: 50_000_000, comp: 10_000_000 },
      { rec: 60_000_000, eg: 45_000_000, comp: 15_000_000 },
      { rec: 90_000_000, eg: 70_000_000, comp: 20_000_000 },
      { rec: 40_000_000, eg: 50_000_000, comp: 10_000_000 },
      { rec: 120_000_000, eg: 65_000_000, comp: 30_000_000 },
      { rec: 80_000_000, eg: 55_000_000, comp: 15_000_000 },
    ];

    for (let i = 0; i < 12; i++) {
      const inicio = new Date(baseDate);
      inicio.setDate(baseDate.getDate() + i * 7);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);

      const ev = mockEvents[i];
      const saldoInicial = saldoAcc;
      const recaudo = ev.rec;
      const egresos = ev.eg;
      const compromisos = ev.comp;
      const totalSalidas = egresos + compromisos;
      const saldoFinal = saldoInicial + recaudo - totalSalidas;
      saldoAcc = saldoFinal;

      mock.push({
        semana_id: i + 1,
        semana: 24 + i,
        anio: 2026,
        fecha_inicio: inicio.toISOString().split('T')[0],
        fecha_fin: fin.toISOString().split('T')[0],
        saldo_inicial: saldoInicial,
        recaudo,
        recaudo_real: 0,
        recaudo_proyectado: recaudo,
        egresos,
        egresos_real: 0,
        egresos_recurrente: egresos,
        compromisos,
        saldo_final: saldoFinal,
        deficit: saldoFinal < 0,
      });
    }

    return mock;
  }

  // Cálculos consolidados para Tarjetas KPI
  const saldoActual = proyecciones[0]?.saldo_inicial || 0;
  const totalRecaudoProyectado = proyecciones.reduce(
    (acc, p) => acc + p.recaudo,
    0
  );
  const totalCompromisosYEgresos = proyecciones.reduce(
    (acc, p) => acc + p.egresos + p.compromisos,
    0
  );
  const saldoFinalHorizonte =
    proyecciones[proyecciones.length - 1]?.saldo_final || 0;

  const semanasDeficit = proyecciones.filter((p) => p.deficit);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
      {/* Header del Dashboard */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              📊
            </span>
            Flujo de Caja — Grupo Pospin
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Control de liquidez, proyección semanal de cartera y programación de compromisos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/flujo-caja/importar"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition-all shadow-sm flex items-center gap-2"
          >
            <span>🔄</span> Sincronizar SIIGO
          </Link>
          <Link
            href="/flujo-caja/facturas"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <span>🧾</span> Gestión Facturas
          </Link>
        </div>
      </div>

      {/* Banner de Alerta de Déficit si existen semanas en riesgo */}
      {semanasDeficit.length > 0 && (
        <div className="mb-8 p-4 bg-rose-950/40 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-rose-500/20 text-rose-400 rounded-lg text-xl">
              🚨
            </span>
            <div>
              <h4 className="text-base font-bold text-rose-300">
                Atención: Se detectó déficit proyectado en {semanasDeficit.length} semana(s)
              </h4>
              <p className="text-xs text-rose-200/80 mt-0.5">
                Semanas afectadas:{' '}
                {semanasDeficit
                  .map((s) => `Sem ${s.semana} (${formatCOP(s.saldo_final)})`)
                  .join(', ')}
                . Se sugiere acelerar la gestión de recaudo o diferir egresos.
              </p>
            </div>
          </div>
          <Link
            href="/flujo-caja/facturas"
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg self-start sm:self-center transition-colors shadow"
          >
            Gestionar Cartera
          </Link>
        </div>
      )}

      {/* Tarjetas KPI de Métricas Clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Card 1: Saldo Inicial / Actual */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Saldo Inicial Actual
            </span>
            <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-sm">
              🏦
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {formatCOP(saldoActual)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">
            Cuentas bancarias consolidadas
          </span>
        </div>

        {/* Card 2: Recaudo Proyectado (12 Semanas) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Recaudo Proyectado (12 Sem)
            </span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm">
              📈
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {formatCOP(totalRecaudoProyectado)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">
            Facturas pendientes y estimaciones
          </span>
        </div>

        {/* Card 3: Compromisos y Egresos */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Compromisos & Egresos
            </span>
            <span className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-sm">
              📉
            </span>
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">
            {formatCOP(totalCompromisosYEgresos)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">
            Gastos fijos, proveedores y deuda
          </span>
        </div>

        {/* Card 4: Saldo Final Horizonte */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Saldo Final Proyectado
            </span>
            <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-sm">
              🎯
            </span>
          </div>
          <div
            className={`text-2xl font-black font-mono ${
              saldoFinalHorizonte < 0 ? 'text-rose-400' : 'text-indigo-400'
            }`}
          >
            {formatCOP(saldoFinalHorizonte)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block">
            Al finalizar las 12 semanas
          </span>
        </div>
      </div>

      {/* Gráfica Interactiva de Proyección */}
      <div className="mb-10">
        <ChartProyeccion
          proyecciones={proyecciones}
          onSelectSemana={(sem) => setSelectedSemana(sem)}
        />
      </div>

      {/* Tabla Desglosada por Semana */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">
              Desglose Semanal de Flujo de Caja
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Detalle numérico de ingresos, egresos y saldos por período.
            </p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 font-mono">
            {proyecciones.length} Semanas
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">
            <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Calculando proyecciones...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                  <th className="py-3.5 px-4">Semana</th>
                  <th className="py-3.5 px-4">Rango Fechas</th>
                  <th className="py-3.5 px-4 text-right">Saldo Inicial</th>
                  <th className="py-3.5 px-4 text-right">Recaudo Est.</th>
                  <th className="py-3.5 px-4 text-right">Egresos</th>
                  <th className="py-3.5 px-4 text-right">Compromisos</th>
                  <th className="py-3.5 px-4 text-right">Saldo Final</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {proyecciones.map((p) => {
                  const isSelected = selectedSemana?.semana === p.semana;
                  return (
                    <tr
                      key={p.semana_id || p.semana}
                      onClick={() => setSelectedSemana(p)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-600/15 text-white font-medium'
                          : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <td className="py-3.5 px-4 font-bold font-mono text-indigo-300">
                        Semana {p.semana}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {formatFechaEsp(p.fecha_inicio)} – {formatFechaEsp(p.fecha_fin)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                        {formatCOP(p.saldo_inicial)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                        + {formatCOP(p.recaudo)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        - {formatCOP(p.egresos)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                        - {formatCOP(p.compromisos)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono font-bold ${
                          p.saldo_final < 0 ? 'text-rose-400' : 'text-indigo-300'
                        }`}
                      >
                        {formatCOP(p.saldo_final)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {p.deficit ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            🔴 Déficit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✅ Saludable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
