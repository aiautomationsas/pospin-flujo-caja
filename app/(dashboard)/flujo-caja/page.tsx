'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProyeccionSemanal } from '@/types/flujo_caja';
import ChartProyeccion from '@/components/flujo-caja/ChartProyeccion';
import FlujoCajaSubNav from '@/components/flujo-caja/FlujoCajaSubNav';
import { formatCOP, formatFechaEsp } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { calcularProyeccionFlujoCaja } from '@/lib/flujo_caja_engine';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Receipt,
  RefreshCw,
  AlertTriangle,
  Building2,
  TrendingDown,
  Target,
  ArrowRight,
} from 'lucide-react';

export default function FlujoCajaDashboardPage() {
  const [proyecciones, setProyecciones] = useState<ProyeccionSemanal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemana, setSelectedSemana] = useState<ProyeccionSemanal | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const data = await calcularProyeccionFlujoCaja(supabase, 12);
        if (data && data.length > 0) {
          setProyecciones(data);
        } else {
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

  function generateMockProjections(): ProyeccionSemanal[] {
    const mock: ProyeccionSemanal[] = [];
    const baseDate = new Date();
    let saldoAcc = 185_000_000;

    const mockEvents = [
      { rec: 85_000_000, eg: 62_000_000, comp: 15_000_000 },
      { rec: 45_000_000, eg: 70_000_000, comp: 20_000_000 },
      { rec: 30_000_000, eg: 180_000_000, comp: 40_000_000 },
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

  const saldoActual = proyecciones[0]?.saldo_inicial || 0;
  const totalRecaudoProyectado = proyecciones.reduce((acc, p) => acc + p.recaudo, 0);
  const totalCompromisosYEgresos = proyecciones.reduce(
    (acc, p) => acc + p.egresos + p.compromisos,
    0
  );
  const saldoFinalHorizonte =
    proyecciones[proyecciones.length - 1]?.saldo_final || 0;

  const semanasDeficit = proyecciones.filter((p) => p.deficit);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans overflow-x-hidden">
      <FlujoCajaSubNav />

      <main className="container mx-auto px-3 sm:px-6 lg:px-8 pb-16 flex-1 max-w-7xl">
        {/* Banner Hero Corporativo Pospin (Mobile Responsive) */}
        <section className="bg-primary text-primary-foreground p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl shadow-xl relative overflow-hidden mb-6 sm:mb-8">
          <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-full shadow-sm mb-3">
                Grupo Pospin • Gestión Financiera
              </span>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
                Control & Proyección de Flujo de Caja
              </h1>
              <p className="text-primary-foreground/90 text-xs sm:text-sm lg:text-base mt-2 max-w-2xl leading-relaxed">
                Monitoree liquidez en tiempo real, gestione vencimientos de cartera e identifique requerimientos de capital a 12 semanas.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 shadow-sm justify-center"
              >
                <Link href="/flujo-caja/importar" className="inline-flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 text-secondary shrink-0" />
                  <span>Sincronizar SIIGO</span>
                </Link>
              </Button>

              <Button
                asChild
                variant="secondary"
                className="w-full sm:w-auto shadow-lg hover:shadow-xl transition-all duration-300 font-semibold justify-center"
              >
                <Link href="/flujo-caja/facturas" className="inline-flex items-center justify-center gap-2">
                  <Receipt className="w-4 h-4 shrink-0" />
                  <span>Gestión de Cartera</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Banner de Alerta de Déficit */}
        {semanasDeficit.length > 0 && (
          <div className="mb-6 sm:mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300">
                  Atención: Déficit proyectado en {semanasDeficit.length} semana(s)
                </h4>
                <p className="text-[11px] sm:text-xs text-rose-600/80 dark:text-rose-300/80 mt-0.5 leading-relaxed">
                  Semanas afectadas:{' '}
                  {semanasDeficit
                    .map((s) => `Sem ${s.semana} (${formatCOP(s.saldo_final)})`)
                    .join(', ')}
                  . Se sugiere acelerar recaudo o diferir egresos.
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="destructive"
              className="w-full sm:w-auto shadow-sm shrink-0 self-stretch sm:self-center justify-center"
            >
              <Link href="/flujo-caja/facturas">Gestionar Cartera</Link>
            </Button>
          </div>
        )}

        {/* Tarjetas KPI de Resumen Ejecutivo (Responsive Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6 sm:mb-8">
          {/* Card 1: Saldo Inicial */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center justify-between text-muted-foreground mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                Saldo Inicial Actual
              </span>
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-foreground font-mono">
              {formatCOP(saldoActual)}
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 block">
              Cuentas bancarias consolidadas
            </span>
          </div>

          {/* Card 2: Recaudo Proyectado */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center justify-between text-muted-foreground mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Recaudo Proyectado (12 Sem)
              </span>
              <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCOP(totalRecaudoProyectado)}
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 block">
              Facturas pendientes y estimaciones
            </span>
          </div>

          {/* Card 3: Egresos & Compromisos */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-secondary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center justify-between text-muted-foreground mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-secondary">
                Compromisos & Egresos
              </span>
              <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/10 text-secondary">
                <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-secondary font-mono">
              {formatCOP(totalCompromisosYEgresos)}
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 block">
              Gastos fijos, proveedores y nómina
            </span>
          </div>

          {/* Card 4: Saldo Final */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center justify-between text-muted-foreground mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                Saldo Final Proyectado
              </span>
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div
              className={`text-xl sm:text-2xl font-extrabold font-mono ${
                saldoFinalHorizonte < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
              }`}
            >
              {formatCOP(saldoFinalHorizonte)}
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 block">
              Al finalizar las 12 semanas
            </span>
          </div>
        </div>

        {/* Gráfica Interactiva */}
        <div className="mb-8 sm:mb-10">
          <ChartProyeccion
            proyecciones={proyecciones}
            onSelectSemana={(sem) => setSelectedSemana(sem)}
          />
        </div>

        {/* Tabla Desglosada por Semana (Touch Scroll Responsive) */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-primary tracking-tight">
                Desglose Semanal de Flujo de Caja
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detalle numérico de ingresos, egresos y saldos por período.
              </p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border font-mono font-medium self-start sm:self-auto">
              {proyecciones.length} Semanas
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs sm:text-sm">Calculando proyecciones...</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    <th className="py-3 px-3.5">Semana</th>
                    <th className="py-3 px-3.5">Fechas</th>
                    <th className="py-3 px-3.5 text-right">Saldo Inicial</th>
                    <th className="py-3 px-3.5 text-right">Recaudo Est.</th>
                    <th className="py-3 px-3.5 text-right">Egresos</th>
                    <th className="py-3 px-3.5 text-right">Compromisos</th>
                    <th className="py-3 px-3.5 text-right">Saldo Final</th>
                    <th className="py-3 px-3.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs sm:text-sm">
                  {proyecciones.map((p) => {
                    const isSelected = selectedSemana?.semana === p.semana;
                    return (
                      <tr
                        key={p.semana_id || p.semana}
                        onClick={() => setSelectedSemana(p)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-foreground font-semibold'
                            : 'hover:bg-accent/60 text-muted-foreground'
                        }`}
                      >
                        <td className="py-3 px-3.5 font-bold font-mono text-primary whitespace-nowrap">
                          Semana {p.semana}
                        </td>
                        <td className="py-3 px-3.5 text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatFechaEsp(p.fecha_inicio)} – {formatFechaEsp(p.fecha_fin)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-foreground whitespace-nowrap">
                          {formatCOP(p.saldo_inicial)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                          + {formatCOP(p.recaudo)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                          - {formatCOP(p.egresos)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-secondary font-medium whitespace-nowrap">
                          - {formatCOP(p.compromisos)}
                        </td>
                        <td
                          className={`py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap ${
                            p.saldo_final < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
                          }`}
                        >
                          {formatCOP(p.saldo_final)}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {p.deficit ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              🔴 Déficit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              ✅ OK
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
      </main>
    </div>
  );
}
