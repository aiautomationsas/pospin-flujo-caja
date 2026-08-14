'use client';

import React, { useEffect, useState } from 'react';
import type { Obligacion, CuentaBancaria, CategoriaEgreso } from '@/types/flujo_caja';
import { formatCOP, formatFechaEsp } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import FlujoCajaSubNav from '@/components/flujo-caja/FlujoCajaSubNav';
import { Button } from '@/components/ui/button';
import {
  CreditCard,
  Plus,
  Search,
  DollarSign,
  X,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
} from 'lucide-react';

export default function ObligacionesPage() {
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [categorias, setCategorias] = useState<CategoriaEgreso[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<string>('todas');
  const [filterPrioridad, setFilterPrioridad] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedObligacion, setSelectedObligacion] = useState<Obligacion | null>(null);

  const [newObligacion, setNewObligacion] = useState({
    tercero: '',
    categoria_id: '',
    concepto: '',
    monto_total: '',
    fecha_vencimiento: new Date().toISOString().split('T')[0],
    fecha_programada_pago: new Date().toISOString().split('T')[0],
    prioridad: 'media',
  });

  const [paymentInput, setPaymentInput] = useState({
    monto_pagado: '',
    cuenta_id: '',
    comprobante_ref: '',
    fecha_pago: new Date().toISOString().split('T')[0],
  });

  const [nuevaFechaProg, setNuevaFechaProg] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch obligaciones
      const { data: obData } = await supabase
        .from('obligaciones')
        .select('*')
        .order('fecha_programada_pago', { ascending: true });

      // Fetch cuentas bancarias
      const { data: cData } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('activa', true)
        .order('nombre', { ascending: true });

      // Fetch categorias
      const { data: catData } = await supabase
        .from('categorias_egreso')
        .select('*')
        .order('nombre', { ascending: true });

      setObligaciones(obData || []);
      setCuentas(cData || []);
      setCategorias(catData || []);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  }

  // KPIs
  const todayStr = new Date().toISOString().split('T')[0];
  const totalPendiente = obligaciones.reduce(
    (acc, item) => (item.estado !== 'pagada' ? acc + Number(item.saldo_pendiente || 0) : acc),
    0
  );
  const vencidas = obligaciones.filter(
    (item) => item.estado !== 'pagada' && item.fecha_vencimiento < todayStr
  );
  const totalVencido = vencidas.reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0);
  const totalProgramado = obligaciones.reduce(
    (acc, item) => (item.estado !== 'pagada' && item.fecha_programada_pago ? acc + Number(item.saldo_pendiente || 0) : acc),
    0
  );

  // Filter list
  const filteredObligaciones = obligaciones.filter((item) => {
    if (activeTab !== 'todas' && item.estado !== activeTab) return false;
    if (filterPrioridad !== 'todas' && item.prioridad !== filterPrioridad) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        item.tercero.toLowerCase().includes(term) ||
        item.concepto.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Create handler
  async function handleCreateObligacion(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!newObligacion.tercero || !newObligacion.concepto || !newObligacion.monto_total) {
      setFormError('Por favor completa todos los campos obligatorios.');
      return;
    }

    const monto = parseFloat(newObligacion.monto_total);
    if (isNaN(monto) || monto <= 0) {
      setFormError('Ingresa un monto válido.');
      return;
    }

    try {
      const { error } = await supabase.from('obligaciones').insert({
        tercero: newObligacion.tercero,
        categoria_id: newObligacion.categoria_id ? parseInt(newObligacion.categoria_id) : null,
        concepto: newObligacion.concepto,
        monto_total: monto,
        saldo_pendiente: monto,
        fecha_vencimiento: newObligacion.fecha_vencimiento,
        fecha_programada_pago: newObligacion.fecha_programada_pago,
        prioridad: newObligacion.prioridad,
        estado: 'pendiente',
      });

      if (error) throw error;

      setShowCreateModal(false);
      setNewObligacion({
        tercero: '',
        categoria_id: '',
        concepto: '',
        monto_total: '',
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        fecha_programada_pago: new Date().toISOString().split('T')[0],
        prioridad: 'media',
      });
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la obligación.');
    }
  }

  // Payment handler
  async function handleRegisterPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedObligacion) return;
    setFormError(null);

    const monto = parseFloat(paymentInput.monto_pagado);
    if (isNaN(monto) || monto <= 0) {
      setFormError('Ingresa un monto de pago válido.');
      return;
    }

    if (!paymentInput.cuenta_id) {
      setFormError('Selecciona la cuenta bancaria de origen.');
      return;
    }

    try {
      const cuentaId = parseInt(paymentInput.cuenta_id);
      const nuevoSaldo = Math.max(0, Number(selectedObligacion.saldo_pendiente) - monto);
      const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'parcial';

      // 1. Insert payment record
      await supabase.from('pagos_obligaciones').insert({
        obligacion_id: selectedObligacion.id,
        cuenta_id: cuentaId,
        monto_pagado: monto,
        fecha_pago: paymentInput.fecha_pago,
        comprobante_ref: paymentInput.comprobante_ref || null,
      });

      // 2. Update obligation balance and state
      await supabase
        .from('obligaciones')
        .update({
          saldo_pendiente: nuevoSaldo,
          estado: nuevoEstado,
        })
        .eq('id', selectedObligacion.id);

      // 3. Deduct from bank account balance
      const cuentaActual = cuentas.find((c) => c.id === cuentaId);
      if (cuentaActual) {
        const nuevoSaldoCuenta = Math.max(0, Number(cuentaActual.saldo || 0) - monto);
        await supabase
          .from('cuentas_bancarias')
          .update({ saldo: nuevoSaldoCuenta })
          .eq('id', cuentaId);
      }

      setShowPaymentModal(false);
      setSelectedObligacion(null);
      setPaymentInput({
        monto_pagado: '',
        cuenta_id: '',
        comprobante_ref: '',
        fecha_pago: new Date().toISOString().split('T')[0],
      });
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Error al registrar el pago.');
    }
  }

  // Reschedule handler
  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedObligacion || !nuevaFechaProg) return;

    try {
      await supabase
        .from('obligaciones')
        .update({
          fecha_programada_pago: nuevaFechaProg,
          estado: selectedObligacion.estado === 'vencida' ? 'reprogramada' : selectedObligacion.estado,
        })
        .eq('id', selectedObligacion.id);

      setShowRescheduleModal(false);
      setSelectedObligacion(null);
      fetchData();
    } catch (err: any) {
      console.error('Error rescheduling:', err);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      <FlujoCajaSubNav />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CreditCard className="w-8 h-8 text-primary" />
              Obligaciones & Cuentas por Pagar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión unificada de pasivos, programación de pagos y trazabilidad bancaria (SSOT).
            </p>
          </div>

          <Button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto shadow-md gap-2"
          >
            <Plus className="w-4 h-4" />
            Nueva Obligación
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Pendiente
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {formatCOP(totalPendiente)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Saldo total por abonar</p>
          </div>

          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 shadow-sm">
            <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
              Vencidas
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {formatCOP(totalVencido)}
            </div>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              {vencidas.length} obligaciones en mora
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Programado
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {formatCOP(totalProgramado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Fechas asignadas de pago</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cuentas Bancarias
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">{cuentas.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Cuentas activas para desembolso</p>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            {['todas', 'pendiente', 'parcial', 'pagada', 'vencida'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar tercero o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Cargando obligaciones...</div>
        ) : filteredObligaciones.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card">
            <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="font-semibold text-foreground">No hay obligaciones registradas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Haz clic en "Nueva Obligación" para agregar una cuenta por pagar.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="p-3">Tercero</th>
                    <th className="p-3">Concepto</th>
                    <th className="p-3">Vencimiento</th>
                    <th className="p-3">Fecha Prog.</th>
                    <th className="p-3">Prioridad</th>
                    <th className="p-3">Monto Total</th>
                    <th className="p-3">Saldo Pendiente</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredObligaciones.map((ob) => (
                    <tr key={ob.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-3 font-semibold text-foreground">{ob.tercero}</td>
                      <td className="p-3 text-muted-foreground">{ob.concepto}</td>
                      <td className="p-3">{formatFechaEsp(ob.fecha_vencimiento)}</td>
                      <td className="p-3 font-medium">{formatFechaEsp(ob.fecha_programada_pago)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            ob.prioridad === 'alta'
                              ? 'bg-red-500/10 text-red-600'
                              : ob.prioridad === 'media'
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-green-500/10 text-green-600'
                          }`}
                        >
                          {ob.prioridad}
                        </span>
                      </td>
                      <td className="p-3 font-semibold">{formatCOP(ob.monto_total)}</td>
                      <td className="p-3 font-bold text-foreground">
                        {formatCOP(ob.saldo_pendiente)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            ob.estado === 'pagada'
                              ? 'bg-green-500/10 text-green-600'
                              : ob.estado === 'parcial'
                              ? 'bg-blue-500/10 text-blue-600'
                              : ob.estado === 'vencida'
                              ? 'bg-red-500/10 text-red-600'
                              : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {ob.estado}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        {ob.estado !== 'pagada' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedObligacion(ob);
                                setPaymentInput({
                                  monto_pagado: String(ob.saldo_pendiente),
                                  cuenta_id: cuentas[0]?.id ? String(cuentas[0].id) : '',
                                  comprobante_ref: '',
                                  fecha_pago: todayStr,
                                });
                                setShowPaymentModal(true);
                              }}
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <DollarSign className="w-3 h-3" /> Abonar
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedObligacion(ob);
                                setNuevaFechaProg(ob.fecha_programada_pago);
                                setShowRescheduleModal(true);
                              }}
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <Calendar className="w-3 h-3" /> Fechas
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Crear Obligación */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" /> Nueva Obligación (CxP)
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateObligacion} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Tercero / Proveedor *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Leasing Bancolombia"
                  value={newObligacion.tercero}
                  onChange={(e) => setNewObligacion({ ...newObligacion, tercero: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Concepto / Descripción *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cuota 12 vehículo operativo"
                  value={newObligacion.concepto}
                  onChange={(e) => setNewObligacion({ ...newObligacion, concepto: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Monto Total ($) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="100000"
                  placeholder="0"
                  value={newObligacion.monto_total}
                  onChange={(e) => setNewObligacion({ ...newObligacion, monto_total: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={newObligacion.fecha_vencimiento}
                    onChange={(e) => setNewObligacion({ ...newObligacion, fecha_vencimiento: e.target.value })}
                    className="w-full p-2 rounded-lg border border-input bg-background"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Fecha Programada *</label>
                  <input
                    type="date"
                    required
                    value={newObligacion.fecha_programada_pago}
                    onChange={(e) => setNewObligacion({ ...newObligacion, fecha_programada_pago: e.target.value })}
                    className="w-full p-2 rounded-lg border border-input bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Prioridad</label>
                <select
                  value={newObligacion.prioridad}
                  onChange={(e) => setNewObligacion({ ...newObligacion, prioridad: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar Obligación</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pago */}
      {showPaymentModal && selectedObligacion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" /> Registrar Abono / Pago
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg mb-4 text-xs space-y-1">
              <p>
                <span className="font-semibold">Tercero:</span> {selectedObligacion.tercero}
              </p>
              <p>
                <span className="font-semibold">Saldo Actual:</span>{' '}
                {formatCOP(selectedObligacion.saldo_pendiente)}
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegisterPayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Monto a Abonar / Pagar ($) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="50000"
                  max={selectedObligacion.saldo_pendiente}
                  value={paymentInput.monto_pagado}
                  onChange={(e) => setPaymentInput({ ...paymentInput, monto_pagado: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Cuenta Bancaria de Origen *</label>
                <select
                  required
                  value={paymentInput.cuenta_id}
                  onChange={(e) => setPaymentInput({ ...paymentInput, cuenta_id: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                >
                  <option value="">Selecciona una cuenta...</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.banco}) - Saldo: {formatCOP(c.saldo)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Fecha de Pago *</label>
                <input
                  type="date"
                  required
                  value={paymentInput.fecha_pago}
                  onChange={(e) => setPaymentInput({ ...paymentInput, fecha_pago: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Referencia / Comprobante</label>
                <input
                  type="text"
                  placeholder="Ej: Transf. 98412"
                  value={paymentInput.comprobante_ref}
                  onChange={(e) => setPaymentInput({ ...paymentInput, comprobante_ref: e.target.value })}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">
                  Confirmar Pago
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reprogramar Fecha */}
      {showRescheduleModal && selectedObligacion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" /> Reprogramar Fecha de Pago
              </h3>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReschedule} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Nueva Fecha Programada de Pago</label>
                <input
                  type="date"
                  required
                  value={nuevaFechaProg}
                  onChange={(e) => setNuevaFechaProg(e.target.value)}
                  className="w-full p-2 rounded-lg border border-input bg-background"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowRescheduleModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar Fecha</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
