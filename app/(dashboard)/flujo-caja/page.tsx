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

  // Cargar proyección desde Supabase o generar datos demo
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
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Sub-Navegación del Módulo Flujo de Caja */}
      <FlujoCajaSubNav />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pb-16 flex-1">
        {/* Banner Hero Corporativo Pospin */}
        <section className="bg-primary text-primary-foreground py-10 px-6 sm:px-10 rounded-3xl shadow-xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-wider rounded-full shadow-sm mb-3">
                Grupo Pospin • Gestión Financiera
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Control & Proyección de Flujo de Caja
              </h1>
              <p className="text-primary-foreground/90 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
                Monitoree liquidez en tiempo real, gestione vencimientos de cartera e identifique requerimientos de capital a 12 semanas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant="outline"
                className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 shadow-sm"
              >
                <Link href="/flujo-caja/importar" className="inline-flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-secondary" />
                  <span>Sincronizar SIIGO</span>
                </Link>
              </Button>

              <Button
                asChild
                variant="secondary"
                className="shadow-lg hover:shadow-xl transition-all duration-300 font-semibold"
              >
                <Link href="/flujo-caja/facturas" className="inline-flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  <span>Gestión de Cartera</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Banner de Alerta de Déficit si existen semanas en riesgo */}
        {semanasDeficit.length > 0 && (
          <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-rose-700 dark:text-rose-300">
                  Atención: Déficit proyectado detectado en {semanasDeficit.length} semana(s)
                </h4>
                <p className="text-xs text-rose-600/80 dark:text-rose-300/80 mt-0.5">
                  Semanas afectadas:{' '}
                  {semanasDeficit
                    .map((s) => `Sem ${s.semana} (${formatCOP(s.saldo_final)})`)
                    .join(', ')}
                  . Se sugiere acelerar la gestión de recaudo o diferir egresos.
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="destructive"
              className="shadow-sm self-start sm:self-center"
            >
              <Link href="/flujo-caja/facturas">Gestionar Cartera</Link>
            </Button>
          </div>
        )}

        {/* Tarjetas KPI de Resumen Ejecutivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Card 1: Saldo Inicial / Actual */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="flex items-center justify-between text-muted-foreground mb-3 relative z-10">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Saldo Inicial Actual
              </span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-foreground font-mono relative z-10">
              {formatCOP(saldoActual)}
            </div>
            <span className="text-xs text-muted-foreground mt-2 block relative z-10">
              Cuentas bancarias consolidadas
            </span>
          </div>

          {/* Card 2: Recaudo Proyectado (12 Semanas) */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="flex items-center justify-between text-muted-foreground mb-3 relative z-10">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Recaudo Proyectado (12 Sem)
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono relative z-10">
              {formatCOP(totalRecaudoProyectado)}
            </div>
            <span className="text-xs text-muted-foreground mt-2 block relative z-10">
              Facturas pendientes y estimaciones
            </span>
          </div>

          {/* Card 3: Compromisos y Egresos */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-secondary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="flex items-center justify-between text-muted-foreground mb-3 relative z-10">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Compromisos & Egresos
              </span>
              <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-secondary font-mono relative z-10">
              {formatCOP(totalCompromisosYEgresos)}
            </div>
            <span className="text-xs text-muted-foreground mt-2 block relative z-10">
              Gastos fijos, proveedores y nómina
            </span>
          </div>

          {/* Card 4: Saldo Final Horizonte */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="flex items-center justify-between text-muted-foreground mb-3 relative z-10">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Saldo Final Proyectado
              </span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Target className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-extrabold font-mono relative z-10 ${
                saldoFinalHorizonte < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
              }`}
            >
              {formatCOP(saldoFinalHorizonte)}
            </div>
            <span className="text-xs text-muted-foreground mt-2 block relative z-10">
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
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-primary tracking-tight">
                Desglose Semanal de Flujo de Caja
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detalle numérico de ingresos, egresos y saldos por período.
              </p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg border border-border font-mono font-medium">
              {proyecciones.length} Semanas
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p>Calculando proyecciones...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
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
                <tbody className="divide-y divide-border text-sm">
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
                        <td className="py-3.5 px-4 font-bold font-mono text-primary">
                          Semana {p.semana}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatFechaEsp(p.fecha_inicio)} – {formatFechaEsp(p.fecha_fin)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-foreground">
                          {formatCOP(p.saldo_inicial)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                          + {formatCOP(p.recaudo)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                          - {formatCOP(p.egresos)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-secondary font-medium">
                          - {formatCOP(p.compromisos)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono font-bold ${
                            p.saldo_final < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
                          }`}
                        >
                          {formatCOP(p.saldo_final)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {p.deficit ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              🔴 Déficit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
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
      </main>
    </div>
  );
}
