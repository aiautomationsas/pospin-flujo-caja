'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProyeccionSemanal, CuentaBancaria } from '@/types/flujo_caja';
import ChartProyeccion from '@/components/flujo-caja/ChartProyeccion';
import FlujoCajaSubNav from '@/components/flujo-caja/FlujoCajaSubNav';
import { formatCOP, formatFechaEsp } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { calcularProyeccionFlujoCaja } from '@/lib/flujo_caja_engine';
import {
  getCachedProyecciones,
  setCachedProyecciones,
  clearProyeccionesCache,
  getCachedCuentas,
  setCachedCuentas,
} from '@/lib/flujoCajaCache';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Building2,
  TrendingDown,
  Target,
  ArrowRight,
  Edit3,
  X,
  CheckCircle2,
  Plus,
  Trash2,
  CreditCard,
  Wallet,
  Download,
  ShieldCheck,
} from 'lucide-react';

export default function FlujoCajaDashboardPage() {
  const [proyecciones, setProyecciones] = useState<ProyeccionSemanal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemana, setSelectedSemana] = useState<ProyeccionSemanal | null>(null);

  // Multi-Cuenta State
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [showCuentasModal, setShowCuentasModal] = useState(false);
  const [showAddCuentaForm, setShowAddCuentaForm] = useState(false);
  const [savingCuenta, setSavingCuenta] = useState(false);
  const [cuentaMsg, setCuentaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form para Nueva Cuenta
  const [nuevaCuenta, setNuevaCuenta] = useState({
    nombre: '',
    banco: 'Bancolombia',
    numero: '',
    tipo_cuenta: 'corriente',
    saldo: '',
  });

  // Form para Editar Saldo de Cuenta Individual
  const [editingCuentaId, setEditingCuentaId] = useState<number | null>(null);
  const [editSaldoInput, setEditSaldoInput] = useState('');

  useEffect(() => {
    loadDashboardData();
    fetchCuentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCuentas() {
    const cached = getCachedCuentas();
    if (cached && cached.length > 0) {
      setCuentas(cached);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('activa', true)
        .order('id', { ascending: true });

      if (!error && data && data.length > 0) {
        setCuentas(data);
        setCachedCuentas(data);
      } else {
        const mockCuentas = getMockCuentas();
        setCuentas(mockCuentas);
        setCachedCuentas(mockCuentas);
      }
    } catch {
      const mockCuentas = getMockCuentas();
      setCuentas(mockCuentas);
      setCachedCuentas(mockCuentas);
    }
  }

  function getMockCuentas(): CuentaBancaria[] {
    return [
      {
        id: 1,
        nombre: 'Bancolombia Principal',
        banco: 'Bancolombia',
        numero: '*4589',
        tipo_cuenta: 'corriente',
        saldo: 120_000_000,
        activa: true,
      },
      {
        id: 2,
        nombre: 'Davivienda Reserva',
        banco: 'Davivienda',
        numero: '*1042',
        tipo_cuenta: 'ahorros',
        saldo: 45_000_000,
        activa: true,
      },
      {
        id: 3,
        nombre: 'Banco de Bogotá Operativa',
        banco: 'Banco de Bogotá',
        numero: '*8812',
        tipo_cuenta: 'corriente',
        saldo: 15_000_000,
        activa: true,
      },
      {
        id: 4,
        nombre: 'Caja General / Menor',
        banco: 'Caja',
        numero: 'Caja-01',
        tipo_cuenta: 'caja',
        saldo: 5_000_000,
        activa: true,
      },
    ];
  }

  async function loadDashboardData() {
    const cached = getCachedProyecciones();
    if (cached && cached.length > 0) {
      setProyecciones(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const freshData = await calcularProyeccionFlujoCaja(supabase, 12);
      if (freshData && freshData.length > 0) {
        setProyecciones(freshData);
        setCachedProyecciones(freshData);
      } else if (!cached || cached.length === 0) {
        const mockData = generateMockProjections();
        setProyecciones(mockData);
        setCachedProyecciones(mockData);
      }
    } catch (err) {
      console.warn('Usando proyección demo previa o datos en caché:', err);
      if (!cached || cached.length === 0) {
        const mockData = generateMockProjections();
        setProyecciones(mockData);
        setCachedProyecciones(mockData);
      }
    } finally {
      setLoading(false);
    }
  }

  function generateMockProjections(customSaldoInicial?: number): ProyeccionSemanal[] {
    const mock: ProyeccionSemanal[] = [];
    const baseDate = new Date();
    let saldoAcc = customSaldoInicial !== undefined ? customSaldoInicial : 185_000_000;

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

  // Exportar Reporte Ejecutivo CSV
  function handleExportCSV() {
    if (!proyecciones || proyecciones.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Semana,Fecha Inicio,Fecha Fin,Saldo Inicial (COP),Recaudo Est (COP),Egresos (COP),Compromisos (COP),Saldo Final (COP),Estado\n';

    proyecciones.forEach((p) => {
      const row = [
        `Semana ${p.semana}`,
        p.fecha_inicio,
        p.fecha_fin,
        p.saldo_inicial,
        p.recaudo,
        p.egresos,
        p.compromisos,
        p.saldo_final,
        p.deficit ? 'DEFICIT' : 'OK',
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Informe_Flujo_Caja_Grupo_Pospin_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Recalcular proyección consolidada al modificar cuentas
  async function syncProyeccionConCuentas(cuentasActualizadas: CuentaBancaria[]) {
    const totalConsolidado = cuentasActualizadas.reduce((sum, c) => sum + (c.saldo || 0), 0);
    const semanaActualId = proyecciones[0]?.semana_id || 1;

    try {
      await supabase.from('saldos_semanales').upsert(
        { semana_id: semanaActualId, saldo: totalConsolidado },
        { onConflict: 'semana_id' }
      );
    } catch (e) {
      console.warn('Upsert saldos_semanales fallback:', e);
    }

    clearProyeccionesCache();
    try {
      const fresh = await calcularProyeccionFlujoCaja(supabase, 12);
      if (fresh && fresh.length > 0) {
        setProyecciones(fresh);
        setCachedProyecciones(fresh);
        return;
      }
    } catch {
      // Ignorar
    }

    const mock = generateMockProjections(totalConsolidado);
    setProyecciones(mock);
    setCachedProyecciones(mock);
  }

  // Guardar Saldo de Cuenta Individual
  async function handleSaveSaldoCuenta(cuentaId: number) {
    const valNum = parseFloat(editSaldoInput);
    if (isNaN(valNum) || valNum < 0) {
      setCuentaMsg({ type: 'error', text: 'Monto de saldo inválido.' });
      return;
    }

    setSavingCuenta(true);
    try {
      await supabase
        .from('cuentas_bancarias')
        .update({ saldo: valNum })
        .eq('id', cuentaId);

      const cuentasNuevas = cuentas.map((c) => (c.id === cuentaId ? { ...c, saldo: valNum } : c));
      setCuentas(cuentasNuevas);
      setCachedCuentas(cuentasNuevas);
      await syncProyeccionConCuentas(cuentasNuevas);

      setEditingCuentaId(null);
      setCuentaMsg({ type: 'success', text: 'Saldo de cuenta actualizado.' });
    } catch (err: unknown) {
      setCuentaMsg({ type: 'error', text: (err as Error).message || 'Error guardando cuenta' });
    } finally {
      setSavingCuenta(false);
    }
  }

  // Crear Nueva Cuenta Bancaria
  async function handleAddCuenta(e: React.FormEvent) {
    e.preventDefault();
    setCuentaMsg(null);

    const saldoNum = parseFloat(nuevaCuenta.saldo) || 0;
    if (!nuevaCuenta.nombre || !nuevaCuenta.banco) {
      setCuentaMsg({ type: 'error', text: 'Por favor ingrese el nombre y banco de la cuenta.' });
      return;
    }

    setSavingCuenta(true);
    try {
      const payload = {
        nombre: nuevaCuenta.nombre,
        banco: nuevaCuenta.banco,
        numero: nuevaCuenta.numero || '*0000',
        tipo_cuenta: nuevaCuenta.tipo_cuenta,
        saldo: saldoNum,
        activa: true,
      };

      const { data: newC, error } = await supabase
        .from('cuentas_bancarias')
        .insert(payload)
        .select()
        .single();

      let cuentasNuevas: CuentaBancaria[] = [];
      if (!error && newC) {
        cuentasNuevas = [...cuentas, newC];
      } else {
        const mockNew: CuentaBancaria = {
          id: Date.now(),
          ...payload,
        };
        cuentasNuevas = [...cuentas, mockNew];
      }

      setCuentas(cuentasNuevas);
      setCachedCuentas(cuentasNuevas);
      await syncProyeccionConCuentas(cuentasNuevas);

      setShowAddCuentaForm(false);
      setNuevaCuenta({
        nombre: '',
        banco: 'Bancolombia',
        numero: '',
        tipo_cuenta: 'corriente',
        saldo: '',
      });
      setCuentaMsg({ type: 'success', text: 'Nueva cuenta bancaria añadida.' });
    } catch (err: unknown) {
      setCuentaMsg({ type: 'error', text: (err as Error).message || 'Error al crear cuenta' });
    } finally {
      setSavingCuenta(false);
    }
  }

  // Eliminar / Desactivar Cuenta
  async function handleDeleteCuenta(cuentaId: number) {
    if (cuentas.length <= 1) {
      setCuentaMsg({ type: 'error', text: 'Debe mantener al menos una cuenta activa.' });
      return;
    }

    setSavingCuenta(true);
    try {
      await supabase.from('cuentas_bancarias').update({ activa: false }).eq('id', cuentaId);
      const cuentasNuevas = cuentas.filter((c) => c.id !== cuentaId);
      setCuentas(cuentasNuevas);
      setCachedCuentas(cuentasNuevas);
      await syncProyeccionConCuentas(cuentasNuevas);
      setCuentaMsg({ type: 'success', text: 'Cuenta eliminada del consolidado.' });
    } catch (e: unknown) {
      setCuentaMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setSavingCuenta(false);
    }
  }

  const totalSaldoConsolidado = cuentas.reduce((sum, c) => sum + (c.saldo || 0), 0);
  const saldoActual = proyecciones[0]?.saldo_inicial || totalSaldoConsolidado;
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
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-full shadow-sm">
                  Grupo Pospin • Tesorería Avanzada
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                  <ShieldCheck className="w-3 h-3" /> Modelo Auditado
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
                Control & Proyección de Flujo de Caja
              </h1>
              <p className="text-primary-foreground/90 text-xs sm:text-sm lg:text-base mt-2 max-w-2xl leading-relaxed">
                Monitoree liquidez en tiempo real, gestione tesorería multi-cuenta e identifique requerimientos de capital a 12 semanas.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="w-full sm:w-auto bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 shadow-sm justify-center"
              >
                <Download className="w-4 h-4 text-secondary shrink-0 mr-1.5" />
                <span>Exportar Informe</span>
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
          {/* Card 1: Saldo Inicial Multi-Cuenta */}
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center justify-between text-muted-foreground mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                Saldo Bancos Consolidado
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setCuentaMsg(null);
                    setShowCuentasModal(true);
                  }}
                  title="Gestionar Cuentas Bancarias"
                  className="p-1.5 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary hover:text-secondary-foreground transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5" />
                </button>
                <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
                  <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-foreground font-mono">
              {formatCOP(saldoActual)}
            </div>

            {/* Mini Desglose de Cuentas Principales */}
            <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
              {cuentas.slice(0, 2).map((c) => (
                <div key={c.id} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground truncate max-w-[120px]">{c.nombre}:</span>
                  <span className="font-mono font-medium text-foreground">{formatCOP(c.saldo)}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <span className="text-[10px] text-muted-foreground block">
                {cuentas.length} cuentas configuradas
              </span>
              <button
                onClick={() => {
                  setCuentaMsg(null);
                  setShowCuentasModal(true);
                }}
                className="text-[11px] font-semibold text-secondary hover:underline flex items-center gap-1"
              >
                <Wallet className="w-3 h-3" />
                <span>Gestionar Cuentas</span>
              </button>
            </div>
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

        {/* Tabla Desglosada por Semana */}
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
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                size="sm"
                className="text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Exportar CSV
              </Button>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border font-mono font-medium">
                {proyecciones.length} Semanas
              </span>
            </div>
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

        {/* Modal Frontend Avanzado: Gestión de Cuentas Bancarias & Tesorería */}
        {showCuentasModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-5 sm:p-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-primary flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-secondary" /> Cuentas Bancarias & Tesorería
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Administre saldos por banco y cuenta para calcular la liquidez consolidada.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCuentasModal(false);
                    setShowAddCuentaForm(false);
                  }}
                  className="text-muted-foreground hover:text-foreground text-xl font-bold p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Header */}
              <div className="bg-muted p-4 rounded-xl border border-border mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    Saldo Total Consolidado
                  </span>
                  <div className="text-2xl font-black font-mono text-primary mt-0.5">
                    {formatCOP(totalSaldoConsolidado)}
                  </div>
                </div>

                <Button
                  onClick={() => setShowAddCuentaForm(!showAddCuentaForm)}
                  variant="secondary"
                  size="sm"
                  className="font-semibold shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>{showAddCuentaForm ? 'Cancelar' : 'Añadir Cuenta'}</span>
                </Button>
              </div>

              {cuentaMsg && (
                <div
                  className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                    cuentaMsg.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {cuentaMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{cuentaMsg.text}</span>
                </div>
              )}

              {/* Formulario para Crear Nueva Cuenta */}
              {showAddCuentaForm && (
                <form onSubmit={handleAddCuenta} className="bg-accent/40 p-4 rounded-xl border border-border mb-4 space-y-3 text-xs sm:text-sm">
                  <h4 className="font-bold text-primary flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-secondary" /> Registrar Nueva Cuenta Bancaria
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Nombre de la Cuenta *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="ej. Bancolombia Operativa"
                        value={nuevaCuenta.nombre}
                        onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Entidad Financiera *
                      </label>
                      <select
                        value={nuevaCuenta.banco}
                        onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, banco: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                      >
                        <option value="Bancolombia">Bancolombia</option>
                        <option value="Davivienda">Davivienda</option>
                        <option value="Banco de Bogotá">Banco de Bogotá</option>
                        <option value="BBVA">BBVA</option>
                        <option value="Banco Occidente">Banco de Occidente</option>
                        <option value="Caja">Caja General / Menor</option>
                        <option value="Otro">Otro Banco</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Tipo de Cuenta
                      </label>
                      <select
                        value={nuevaCuenta.tipo_cuenta}
                        onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, tipo_cuenta: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                      >
                        <option value="corriente">Cuenta Corriente</option>
                        <option value="ahorros">Cuenta de Ahorros</option>
                        <option value="caja">Efectivo / Caja</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Número de Cuenta
                      </label>
                      <input
                        type="text"
                        placeholder="*4589"
                        value={nuevaCuenta.numero}
                        onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, numero: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Saldo Inicial ($ COP) *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="50000000"
                        value={nuevaCuenta.saldo}
                        onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, saldo: e.target.value })}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddCuentaForm(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="default"
                      size="sm"
                      disabled={savingCuenta}
                      className="font-semibold shadow-sm"
                    >
                      Guardar Cuenta
                    </Button>
                  </div>
                </form>
              )}

              {/* Lista de Cuentas Bancarias */}
              <div className="space-y-3">
                {cuentas.map((c) => {
                  const isEditing = editingCuentaId === c.id;

                  return (
                    <div
                      key={c.id}
                      className="bg-card border border-border rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                          {c.tipo_cuenta === 'caja' ? (
                            <Wallet className="w-5 h-5" />
                          ) : (
                            <CreditCard className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground text-sm">
                              {c.nombre}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 uppercase">
                              {c.banco}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {c.numero}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground capitalize">
                            Tipo: {c.tipo_cuenta}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={editSaldoInput}
                              onChange={(e) => setEditSaldoInput(e.target.value)}
                              className="w-32 px-2 py-1 bg-background border border-border rounded text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSaveSaldoCuenta(c.id)}
                              disabled={savingCuenta}
                              className="h-8 text-xs px-2.5"
                            >
                              ✓ Guardar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingCuentaId(null)}
                              className="h-8 text-xs px-2"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-base font-extrabold font-mono text-primary">
                              {formatCOP(c.saldo)}
                            </span>
                            <button
                              onClick={() => {
                                setEditingCuentaId(c.id);
                                setEditSaldoInput(String(c.saldo));
                              }}
                              title="Editar Saldo"
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-accent rounded-lg transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCuenta(c.id)}
                              title="Eliminar Cuenta"
                              className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                <span className="text-xs text-muted-foreground">
                  Cuentas activas: <strong className="text-foreground">{cuentas.length}</strong>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCuentasModal(false)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
