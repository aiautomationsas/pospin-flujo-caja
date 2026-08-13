/**
 * Utilidades de formato para el módulo de Flujo de Caja (Grupo Pospin).
 * Formateo de pesos colombianos (COP), fechas ISO y porcentajes.
 */

/**
 * Formatea un número como Pesos Colombianos (COP) sin decimales.
 * Ejemplo: 150000000 -> "$ 150.000.000"
 */
export function formatCOP(valor: number): string {
  if (valor === undefined || valor === null || isNaN(valor)) {
    return '$ 0';
  }
  const isNegative = valor < 0;
  const absVal = Math.abs(valor);
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(absVal);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Formatea un número en formato abreviado en millones (M) o miles (k).
 * Ejemplo: 150000000 -> "$ 150M"
 */
export function formatCOPAbreviado(valor: number): string {
  if (valor === undefined || valor === null || isNaN(valor)) {
    return '$ 0';
  }
  const isNegative = valor < 0;
  const absVal = Math.abs(valor);
  
  if (absVal >= 1_000_000_000) {
    return `${isNegative ? '-' : ''}$ ${(absVal / 1_000_000_000).toFixed(1)}B`;
  }
  if (absVal >= 1_000_000) {
    return `${isNegative ? '-' : ''}$ ${(absVal / 1_000_000).toFixed(0)}M`;
  }
  if (absVal >= 1_000) {
    return `${isNegative ? '-' : ''}$ ${(absVal / 1_000).toFixed(0)}k`;
  }
  return formatCOP(valor);
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) a string legible en español (ej. "15 Jun 2026").
 */
export function formatFechaEsp(fechaStr: string | null | undefined): string {
  if (!fechaStr) return '-';
  try {
    const date = new Date(fechaStr + 'T00:00:00');
    return date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return fechaStr;
  }
}
