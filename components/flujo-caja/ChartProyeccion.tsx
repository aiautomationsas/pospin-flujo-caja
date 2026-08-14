'use client';

import React, { useState } from 'react';
import type { ProyeccionSemanal } from '@/types/flujo_caja';
import { formatCOP, formatCOPAbreviado, formatFechaEsp } from '@/lib/format';

interface ChartProyeccionProps {
  proyecciones: ProyeccionSemanal[];
  onSelectSemana?: (semana: ProyeccionSemanal) => void;
  title?: string;
}

export default function ChartProyeccion({
  proyecciones,
  onSelectSemana,
  title = 'Proyección Semanal (12 Semanas)',
}: ChartProyeccionProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showSaldoFinal, setShowSaldoFinal] = useState(true);
  const [showRecaudo, setShowRecaudo] = useState(true);
  const [showEgresos, setShowEgresos] = useState(true);

  if (!proyecciones || proyecciones.length === 0) {
    return (
      <div className="w-full bg-card border border-border rounded-2xl p-6 sm:p-8 text-center text-muted-foreground shadow-sm">
        <svg
          className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-primary/40 animate-pulse"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
          />
        </svg>
        <p className="text-base sm:text-lg font-medium text-foreground">
          No hay datos de proyección disponibles
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Sincronice datos con SIIGO o registre saldos semanales para visualizar la gráfica.
        </p>
      </div>
    );
  }

  const width = 800;
  const height = 360;
  const paddingLeft = 70;
  const paddingRight = 30;
  const paddingTop = 40;
  const paddingBottom = 60;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const saldosFinales = proyecciones.map((p) => p.saldo_final);
  const recaudos = proyecciones.map((p) => p.recaudo);
  const egresos = proyecciones.map((p) => p.egresos + p.compromisos);

  const allValues = [...saldosFinales, ...recaudos, ...egresos, 0];
  let maxVal = Math.max(...allValues);
  let minVal = Math.min(...allValues);

  if (maxVal === minVal) {
    maxVal = maxVal + 100_000_000;
    minVal = minVal - 50_000_000;
  }
  const valRange = maxVal - minVal;

  const getY = (val: number) => {
    const ratio = (val - minVal) / valRange;
    return paddingTop + chartHeight * (1 - ratio);
  };

  const zeroY = getY(0);
  const hasDeficit = minVal < 0;

  const stepX = chartWidth / proyecciones.length;
  const barWidth = Math.max(8, Math.min(22, stepX * 0.28));

  const pointsSaldoFinal = proyecciones.map((p, i) => {
    const x = paddingLeft + i * stepX + stepX / 2;
    const y = getY(p.saldo_final);
    return { x, y, val: p.saldo_final, semana: p };
  });

  const pathD = pointsSaldoFinal.reduce((acc, pt, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${pointsSaldoFinal[pointsSaldoFinal.length - 1].x} ${zeroY} L ${pointsSaldoFinal[0].x} ${zeroY} Z`;

  const activeData =
    hoveredIndex !== null ? proyecciones[hoveredIndex] : null;

  return (
    <div className="w-full bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-md transition-all duration-300">
      {/* Header del Gráfico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg sm:text-xl font-bold text-primary tracking-tight">
              {title}
            </h3>
            {hasDeficit && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                Déficit
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Desglose semanal de recaudos, egresos y saldo final.
          </p>
        </div>

        {/* Toggles de Métricas Responsive */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
          <button
            onClick={() => setShowSaldoFinal(!showSaldoFinal)}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border transition-all min-h-[32px] ${
              showSaldoFinal
                ? 'bg-primary/10 border-primary/40 text-primary font-semibold'
                : 'bg-muted border-border text-muted-foreground line-through'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Saldo Final</span>
          </button>
          <button
            onClick={() => setShowRecaudo(!showRecaudo)}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border transition-all min-h-[32px] ${
              showRecaudo
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'bg-muted border-border text-muted-foreground line-through'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span>Recaudo</span>
          </button>
          <button
            onClick={() => setShowEgresos(!showEgresos)}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border transition-all min-h-[32px] ${
              showEgresos
                ? 'bg-secondary/10 border-secondary/40 text-secondary font-semibold'
                : 'bg-muted border-border text-muted-foreground line-through'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-secondary" />
            <span>Egresos</span>
          </button>
        </div>
      </div>

      {/* Canvas SVG Interactivo con Touch Pan Scroll en Móvil */}
      <div className="relative w-full overflow-x-auto pb-2 no-scrollbar">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[580px] sm:min-w-[650px] overflow-visible"
        >
          <defs>
            <linearGradient id="gradientSaldoPospin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f4f6f" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2f4f6f" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="gradientDeficitPospin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines horizontales y valores Y */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const val = minVal + pct * valRange;
            const y = paddingTop + chartHeight * (1 - pct);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeDasharray="4 4"
                  strokeOpacity="0.6"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill="currentColor"
                  fontSize="10"
                  textAnchor="end"
                  className="font-mono text-muted-foreground fill-muted-foreground"
                >
                  {formatCOPAbreviado(val)}
                </text>
              </g>
            );
          })}

          {/* Línea de Umbral $0 COP */}
          {zeroY >= paddingTop && zeroY <= height - paddingBottom && (
            <g>
              <line
                x1={paddingLeft}
                y1={zeroY}
                x2={width - paddingRight}
                y2={zeroY}
                stroke="#e11d48"
                strokeWidth="1.5"
                strokeDasharray="6 3"
              />
              <text
                x={width - paddingRight + 5}
                y={zeroY + 3}
                fill="#e11d48"
                fontSize="10"
                fontWeight="bold"
              >
                $0
              </text>
            </g>
          )}

          {/* Barras de Recaudo y Egresos */}
          {proyecciones.map((p, i) => {
            const centerX = paddingLeft + i * stepX + stepX / 2;
            const recaudoX = centerX - barWidth - 2;
            const egresosX = centerX + 2;

            const recaudoY = getY(p.recaudo);
            const egresosTotal = p.egresos + p.compromisos;
            const egresosY = getY(egresosTotal);

            const isHovered = hoveredIndex === i;

            return (
              <g
                key={`bars-${i}`}
                className="cursor-pointer transition-opacity duration-200"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onSelectSemana && onSelectSemana(p)}
              >
                {isHovered && (
                  <rect
                    x={paddingLeft + i * stepX}
                    y={paddingTop}
                    width={stepX}
                    height={chartHeight}
                    fill="currentColor"
                    className="text-primary"
                    fillOpacity="0.08"
                    rx="4"
                  />
                )}

                {showRecaudo && p.recaudo > 0 && (
                  <rect
                    x={recaudoX}
                    y={recaudoY}
                    width={barWidth}
                    height={Math.max(2, zeroY - recaudoY)}
                    fill="#10b981"
                    fillOpacity={isHovered ? 0.95 : 0.8}
                    rx="3"
                  />
                )}

                {showEgresos && egresosTotal > 0 && (
                  <rect
                    x={egresosX}
                    y={egresosY}
                    width={barWidth}
                    height={Math.max(2, zeroY - egresosY)}
                    fill="#ca5b12"
                    fillOpacity={isHovered ? 0.95 : 0.8}
                    rx="3"
                  />
                )}

                <text
                  x={centerX}
                  y={height - paddingBottom + 20}
                  fill="currentColor"
                  fontSize="11"
                  fontWeight={p.deficit || isHovered ? 'bold' : 'normal'}
                  textAnchor="middle"
                  className={p.deficit ? 'fill-rose-500 font-bold' : isHovered ? 'fill-primary font-bold' : 'fill-muted-foreground'}
                >
                  Sem {p.semana}
                </text>
                <text
                  x={centerX}
                  y={height - paddingBottom + 34}
                  fill="currentColor"
                  fontSize="9"
                  textAnchor="middle"
                  className="fill-muted-foreground/70"
                >
                  {p.fecha_inicio ? p.fecha_inicio.slice(5) : ''}
                </text>
              </g>
            );
          })}

          {showSaldoFinal && (
            <path
              d={areaD}
              fill={hasDeficit ? 'url(#gradientDeficitPospin)' : 'url(#gradientSaldoPospin)'}
            />
          )}

          {showSaldoFinal && (
            <path
              d={pathD}
              fill="none"
              stroke="#2f4f6f"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {showSaldoFinal &&
            pointsSaldoFinal.map((pt, i) => {
              const isHovered = hoveredIndex === i;
              const isDeficit = pt.val < 0;

              return (
                <g key={`pt-${i}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 7 : 4}
                    fill={isDeficit ? '#e11d48' : '#2f4f6f'}
                    stroke="currentColor"
                    className="text-card transition-all duration-150 cursor-pointer"
                    strokeWidth={isHovered ? 3 : 2}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onSelectSemana && onSelectSemana(pt.semana)}
                  />
                  {isDeficit && (
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      fill="#e11d48"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      !
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
      </div>

      {/* Tooltip Detallado Responsive */}
      {activeData && (
        <div className="mt-3 sm:mt-4 bg-accent/90 border border-border rounded-xl p-3 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-bold text-foreground">
                Semana {activeData.semana} ({activeData.anio})
              </span>
              <span className="text-[11px] sm:text-xs text-muted-foreground">
                {formatFechaEsp(activeData.fecha_inicio)} – {formatFechaEsp(activeData.fecha_fin)}
              </span>
              {activeData.deficit ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  Déficit
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Saludable
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-[11px] sm:text-xs">
            <div>
              <span className="block text-muted-foreground text-[10px]">Saldo Inicial</span>
              <span className="font-mono font-semibold text-foreground">
                {formatCOP(activeData.saldo_inicial)}
              </span>
            </div>
            <div>
              <span className="block text-emerald-600 dark:text-emerald-400 text-[10px]">Recaudo Est.</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                + {formatCOP(activeData.recaudo)}
              </span>
            </div>
            <div>
              <span className="block text-secondary text-[10px]">Egresos + Comp.</span>
              <span className="font-mono font-semibold text-secondary">
                - {formatCOP(activeData.egresos + activeData.compromisos)}
              </span>
            </div>
            <div>
              <span className="block text-primary font-semibold text-[10px]">Saldo Final</span>
              <span
                className={`font-mono font-bold text-xs sm:text-sm ${
                  activeData.saldo_final < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
                }`}
              >
                {formatCOP(activeData.saldo_final)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
