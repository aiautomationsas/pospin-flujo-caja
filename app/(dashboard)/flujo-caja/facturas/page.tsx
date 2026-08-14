'use client';

import React, { useEffect, useState } from 'react';
import type { FacturaConCliente, EstadoFactura, Cliente } from '@/types/flujo_caja';
import { formatCOP, formatFechaEsp } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<FacturaConCliente[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [activeTab, setActiveTab] = useState<EstadoFactura | 'todas'>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRecaudoModal, setShowRecaudoModal] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState<FacturaConCliente | null>(null);

  // Formulario Nueva Factura
  const [newFactura, setNewFactura] = useState({
    cliente_nombre: '',
    numero: '',
    fecha_emision: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '',
    fecha_estimada_recaudo: '',
    valor: '',
  });

  // Formulario Registrar Abono
  const [recaudoInput, setRecaudoInput] = useState({
    valor: '',
    fecha: new Date().toISOString().split('T')[0],
    semana_id: 1,
  });

  const [formError, setFormError] = useState<string | null>(null);

  // Cargar facturas y clientes desde Supabase (con fallback a mock si DB está vacía)
  useEffect(() => {
    fetchFacturas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchFacturas() {
    setLoading(true);
    try {
      // 1. Cargar Clientes
      const { data: clientesData } = await supabase.from('clientes').select('*');
      if (clientesData && clientesData.length > 0) {
        setClientes(clientesData);
      }

      // 2. Cargar Facturas con Recaudos
      const { data: facturasData, error } = await supabase
        .from('facturas')
        .select(`
          *,
          cliente:clientes(nombre, contacto),
          recaudos(valor, fecha)
        `)
        .order('fecha_vencimiento', { ascending: true });

      if (error || !facturasData || facturasData.length === 0) {
        setFacturas(getMockFacturas());
      } else {
        // Calcular total recaudado y saldo pendiente para cada factura
        const facturasProcesadas: FacturaConCliente[] = facturasData.map((f: Record<string, unknown>) => {
          const recaudos = (f.recaudos as Record<string, unknown>[]) || [];
          const totalRecaudado = recaudos.reduce(
            (sum: number, r: Record<string, unknown>) => sum + Number(r.valor),
            0
          );
          const saldoPendiente = Math.max(0, Number(f.valor) - totalRecaudado);
          return {
            ...(f as unknown as FacturaConCliente),
            total_recaudado: totalRecaudado,
            saldo_pendiente: saldoPendiente,
          };
        });
        setFacturas(facturasProcesadas);
      }
    } catch {
      setFacturas(getMockFacturas());
    } finally {
      setLoading(false);
    }
  }

  // Facturas de prueba si no hay conexión a DB
  function getMockFacturas(): FacturaConCliente[] {
    return [
      {
        id: 1,
        cliente_id: 101,
        cliente: { id: 101, nombre: 'CONCONCRETO S.A.', contacto: 'NIT 890.900.123', activo: true, created_at: '' },
        numero: 'FE-1045',
        fecha_emision: '2026-05-15',
        fecha_vencimiento: '2026-06-15',
        fecha_estimada_recaudo: '2026-06-20',
        valor: 156_000_000,
        estado: 'pendiente',
        created_at: '',
        total_recaudado: 0,
        saldo_pendiente: 156_000_000,
      },
      {
        id: 2,
        cliente_id: 102,
        cliente: { id: 102, nombre: 'SOLLA S.A.', contacto: 'NIT 890.101.456', activo: true, created_at: '' },
        numero: 'FE-1042',
        fecha_emision: '2026-04-10',
        fecha_vencimiento: '2026-05-10',
        fecha_estimada_recaudo: '2026-05-25',
        valor: 95_000_000,
        estado: 'parcial',
        created_at: '',
        total_recaudado: 50_000_000,
        saldo_pendiente: 45_000_000,
      },
      {
        id: 3,
        cliente_id: 103,
        cliente: { id: 103, nombre: 'CENTRO COMERCIAL EL TESORO', contacto: 'NIT 800.222.333', activo: true, created_at: '' },
        numero: 'FE-1030',
        fecha_emision: '2026-03-01',
        fecha_vencimiento: '2026-04-01',
        fecha_estimada_recaudo: '2026-04-15',
        valor: 78_500_000,
        estado: 'vencida',
        created_at: '',
        total_recaudado: 0,
        saldo_pendiente: 78_500_000,
      },
      {
        id: 4,
        cliente_id: 104,
        cliente: { id: 104, nombre: 'GRUPO NUTRESA S.A.', contacto: 'NIT 890.300.999', activo: true, created_at: '' },
        numero: 'FE-1012',
        fecha_emision: '2026-02-15',
        fecha_vencimiento: '2026-03-15',
        fecha_estimada_recaudo: '2026-03-15',
        valor: 210_000_000,
        estado: 'pagada',
        created_at: '',
        total_recaudado: 210_000_000,
        saldo_pendiente: 0,
      },
    ];
  }

  // Filtrado de Facturas
  const facturasFiltradas = facturas.filter((f) => {
    // Filtro por Tab Estado
    if (activeTab !== 'todas' && f.estado !== activeTab) {
      return false;
    }
    // Filtro por término de búsqueda (número o nombre de cliente)
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const numMatch = f.numero.toLowerCase().includes(term);
      const clienteMatch = (f.cliente?.nombre || '').toLowerCase().includes(term);
      return numMatch || clienteMatch;
    }
    return true;
  });

  // Métricas Consolidadas
  const totalFacturado = facturas.reduce((acc, f) => acc + f.valor, 0);
  const totalRecaudado = facturas.reduce((acc, f) => acc + (f.total_recaudado || 0), 0);
  const totalPendiente = facturas.reduce((acc, f) => acc + (f.saldo_pendiente || 0), 0);
  const facturasVencidas = facturas.filter((f) => f.estado === 'vencida');

  // Submit Handler: Nueva Factura
  async function handleCreateFactura(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const valorNum = parseFloat(newFactura.valor);
    if (!newFactura.numero || !newFactura.cliente_nombre || isNaN(valorNum) || valorNum <= 0) {
      setFormError('Por favor complete todos los campos obligatorios con valores válidos.');
      return;
    }

    try {
      // 1. Obtener o crear cliente
      let clienteId = clientes.find(
        (c) => c.nombre.toLowerCase() === newFactura.cliente_nombre.toLowerCase()
      )?.id;

      if (!clienteId) {
        const { data: newC } = await supabase
          .from('clientes')
          .insert({ nombre: newFactura.cliente_nombre, activo: true })
          .select('id')
          .single();
        if (newC) clienteId = newC.id;
      }

      // 2. Insertar factura
      const payload = {
        cliente_id: clienteId || 101,
        numero: newFactura.numero,
        fecha_emision: newFactura.fecha_emision,
        fecha_vencimiento: newFactura.fecha_vencimiento || newFactura.fecha_emision,
        fecha_estimada_recaudo: newFactura.fecha_estimada_recaudo || newFactura.fecha_vencimiento,
        valor: valorNum,
        estado: 'pendiente',
      };

      const { data: factCreated, error } = await supabase
        .from('facturas')
        .insert(payload)
        .select(`*, cliente:clientes(nombre)`)
        .single();

      if (error) {
        console.warn('Fallback agregando a estado local:', error.message);
        // Fallback local
        const mockNew: FacturaConCliente = {
          id: Date.now(),
          cliente_id: payload.cliente_id,
          cliente: { id: payload.cliente_id, nombre: newFactura.cliente_nombre, contacto: null, activo: true, created_at: '' },
          numero: payload.numero,
          fecha_emision: payload.fecha_emision,
          fecha_vencimiento: payload.fecha_vencimiento,
          fecha_estimada_recaudo: payload.fecha_estimada_recaudo,
          valor: payload.valor,
          estado: 'pendiente',
          created_at: new Date().toISOString(),
          total_recaudado: 0,
          saldo_pendiente: payload.valor,
        };
        setFacturas([mockNew, ...facturas]);
      } else if (factCreated) {
        setFacturas([{ ...factCreated, total_recaudado: 0, saldo_pendiente: valorNum }, ...facturas]);
      }

      setShowCreateModal(false);
      setNewFactura({
        cliente_nombre: '',
        numero: '',
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: '',
        fecha_estimada_recaudo: '',
        valor: '',
      });
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Error al guardar la factura');
    }
  }

  // Submit Handler: Registrar Recaudo / Abono
  async function handleRegistrarRecaudo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFactura) return;
    setFormError(null);

    const valorAbono = parseFloat(recaudoInput.valor);
    const saldoPend = selectedFactura.saldo_pendiente || selectedFactura.valor;

    if (isNaN(valorAbono) || valorAbono <= 0 || valorAbono > saldoPend + 1) {
      setFormError(`El abono debe ser mayor a $0 y no superar el saldo pendiente (${formatCOP(saldoPend)})`);
      return;
    }

    try {
      const nuevoTotalRecaudado = (selectedFactura.total_recaudado || 0) + valorAbono;
      const nuevoSaldoPendiente = Math.max(0, selectedFactura.valor - nuevoTotalRecaudado);
      const nuevoEstado: EstadoFactura = nuevoSaldoPendiente <= 0 ? 'pagada' : 'parcial';

      // Insertar recaudo en DB
      await supabase.from('recaudos').insert({
        factura_id: selectedFactura.id,
        semana_id: recaudoInput.semana_id || 1,
        valor: valorAbono,
        fecha: recaudoInput.fecha,
      });

      // Actualizar estado de factura
      await supabase
        .from('facturas')
        .update({ estado: nuevoEstado })
        .eq('id', selectedFactura.id);

      // Actualizar state en React UI
      setFacturas(
        facturas.map((f) => {
          if (f.id === selectedFactura.id) {
            return {
              ...f,
              estado: nuevoEstado,
              total_recaudado: nuevoTotalRecaudado,
              saldo_pendiente: nuevoSaldoPendiente,
            };
          }
          return f;
        })
      );

      setShowRecaudoModal(false);
      setSelectedFactura(null);
      setRecaudoInput({
        valor: '',
        fecha: new Date().toISOString().split('T')[0],
        semana_id: 1,
      });
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Error al registrar el recaudo');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              🧾
            </span>
            Gestión de Facturas y Cartera
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Administre cuentas por cobrar, estados de cartera y registro de recaudos.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 self-start sm:self-auto"
        >
          <span>➕</span> Nueva Factura
        </button>
      </div>

      {/* Tarjetas KPI de Resumen de Cartera */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total Facturado
          </span>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {formatCOP(totalFacturado)}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Total Recaudado
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {formatCOP(totalRecaudado)}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Pendiente por Recaudar
          </span>
          <div className="text-2xl font-bold font-mono text-indigo-300 mt-1">
            {formatCOP(totalPendiente)}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
            Facturas Vencidas
          </span>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            {facturasVencidas.length}{' '}
            <span className="text-xs font-normal text-rose-300/70">
              ({formatCOP(facturasVencidas.reduce((a, b) => a + (b.saldo_pendiente || 0), 0))})
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Tabs de Estado */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs de Filtro de Estado */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(
            [
              { key: 'todas', label: 'Todas' },
              { key: 'pendiente', label: 'Pendientes' },
              { key: 'parcial', label: 'Parciales' },
              { key: 'vencida', label: 'Vencidas' },
              { key: 'pagada', label: 'Pagadas' },
            ] as const
          ).map((tab) => {
            const count =
              tab.key === 'todas'
                ? facturas.length
                : facturas.filter((f) => f.estado === tab.key).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Input de Búsqueda */}
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            🔍
          </span>
          <input
            type="text"
            placeholder="Buscar por cliente o factura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Tabla de Facturas */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500">
            <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Cargando facturas de cartera...</p>
          </div>
        ) : facturasFiltradas.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <p className="text-lg font-medium text-slate-400">
              No se encontraron facturas con los filtros seleccionados
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/80">
                  <th className="py-3.5 px-4">Número</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Emisión</th>
                  <th className="py-3.5 px-4">Vencimiento</th>
                  <th className="py-3.5 px-4">Est. Recaudo</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                  <th className="py-3.5 px-4 text-right">Saldo Pendiente</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {facturasFiltradas.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-slate-800/40 text-slate-300 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold font-mono text-indigo-300">
                      {f.numero}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-white">
                      {f.cliente?.nombre || 'Cliente sin nombre'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {formatFechaEsp(f.fecha_emision)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {formatFechaEsp(f.fecha_vencimiento)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-indigo-300 font-medium">
                      {formatFechaEsp(f.fecha_estimada_recaudo)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      {formatCOP(f.valor)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatCOP(f.saldo_pendiente || 0)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          f.estado === 'pagada'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : f.estado === 'parcial'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : f.estado === 'vencida'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {f.estado.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {f.estado !== 'pagada' ? (
                        <button
                          onClick={() => {
                            setSelectedFactura(f);
                            setRecaudoInput({
                              valor: String(f.saldo_pendiente || f.valor),
                              fecha: new Date().toISOString().split('T')[0],
                              semana_id: 1,
                            });
                            setShowRecaudoModal(true);
                          }}
                          className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all"
                        >
                          💰 Abonar
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">
                          Pagada
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Crear Nueva Factura */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white">
                ➕ Registrar Nueva Factura
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateFactura} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. SOLLA S.A."
                  value={newFactura.cliente_nombre}
                  onChange={(e) =>
                    setNewFactura({ ...newFactura, cliente_nombre: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Número de Factura *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="FE-2001"
                    value={newFactura.numero}
                    onChange={(e) =>
                      setNewFactura({ ...newFactura, numero: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Valor ($ COP) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="50000000"
                    value={newFactura.valor}
                    onChange={(e) =>
                      setNewFactura({ ...newFactura, valor: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Emisión
                  </label>
                  <input
                    type="date"
                    value={newFactura.fecha_emision}
                    onChange={(e) =>
                      setNewFactura({ ...newFactura, fecha_emision: e.target.value })
                    }
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Vencimiento
                  </label>
                  <input
                    type="date"
                    value={newFactura.fecha_vencimiento}
                    onChange={(e) =>
                      setNewFactura({ ...newFactura, fecha_vencimiento: e.target.value })
                    }
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Est. Recaudo
                  </label>
                  <input
                    type="date"
                    value={newFactura.fecha_estimada_recaudo}
                    onChange={(e) =>
                      setNewFactura({
                        ...newFactura,
                        fecha_estimada_recaudo: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30"
                >
                  Guardar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Abono / Recaudo */}
      {showRecaudoModal && selectedFactura && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white">
                💰 Registrar Recaudo
              </h3>
              <button
                onClick={() => setShowRecaudoModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Factura:</span>
                <span className="font-bold text-indigo-300 font-mono">
                  {selectedFactura.numero}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="text-white font-medium">
                  {selectedFactura.cliente?.nombre}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Saldo Pendiente Actual:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatCOP(selectedFactura.saldo_pendiente || selectedFactura.valor)}
                </span>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegistrarRecaudo} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Monto a Abonar ($ COP) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedFactura.saldo_pendiente || selectedFactura.valor}
                  value={recaudoInput.valor}
                  onChange={(e) =>
                    setRecaudoInput({ ...recaudoInput, valor: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 font-mono text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Fecha del Recaudo *
                </label>
                <input
                  type="date"
                  required
                  value={recaudoInput.fecha}
                  onChange={(e) =>
                    setRecaudoInput({ ...recaudoInput, fecha: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecaudoModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30"
                >
                  Confirmar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
