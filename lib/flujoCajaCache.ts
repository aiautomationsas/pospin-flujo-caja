import type { ProyeccionSemanal, FacturaConCliente, Cliente, SiigoSyncLog } from '@/types/flujo_caja';

export const CACHE_KEY_PROYECCIONES = 'pospin_flujo_caja_proyecciones_v1';
export const CACHE_KEY_FACTURAS = 'pospin_flujo_caja_facturas_v1';
export const CACHE_KEY_CLIENTES = 'pospin_flujo_caja_clientes_v1';
export const CACHE_KEY_LOGS = 'pospin_flujo_caja_logs_v1';

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos en milisegundos

interface CachePayload<T> {
  data: T;
  timestamp: number;
}

let inMemoryProyecciones: CachePayload<ProyeccionSemanal[]> | null = null;
let inMemoryFacturas: CachePayload<FacturaConCliente[]> | null = null;
let inMemoryClientes: CachePayload<Cliente[]> | null = null;
let inMemoryLogs: CachePayload<SiigoSyncLog[]> | null = null;

export function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL_MS;
}

// ── PROYECCIONES CACHE ──
export function getCachedProyecciones(): ProyeccionSemanal[] | null {
  if (inMemoryProyecciones && isCacheValid(inMemoryProyecciones.timestamp)) {
    return inMemoryProyecciones.data;
  }

  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY_PROYECCIONES);
    if (!raw) return null;

    const parsed: CachePayload<ProyeccionSemanal[]> = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && isCacheValid(parsed.timestamp)) {
      inMemoryProyecciones = parsed;
      return parsed.data;
    }
  } catch (error) {
    console.warn('[flujoCajaCache] Error leyendo proyecciones:', error);
  }

  return null;
}

export function setCachedProyecciones(data: ProyeccionSemanal[]): void {
  const payload: CachePayload<ProyeccionSemanal[]> = { data, timestamp: Date.now() };
  inMemoryProyecciones = payload;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CACHE_KEY_PROYECCIONES, JSON.stringify(payload));
    } catch (error) {
      console.warn('[flujoCajaCache] Error guardando proyecciones:', error);
    }
  }
}

// ── FACTURAS CACHE ──
export function getCachedFacturas(): FacturaConCliente[] | null {
  if (inMemoryFacturas && isCacheValid(inMemoryFacturas.timestamp)) {
    return inMemoryFacturas.data;
  }

  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY_FACTURAS);
    if (!raw) return null;

    const parsed: CachePayload<FacturaConCliente[]> = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && isCacheValid(parsed.timestamp)) {
      inMemoryFacturas = parsed;
      return parsed.data;
    }
  } catch (error) {
    console.warn('[flujoCajaCache] Error leyendo facturas:', error);
  }

  return null;
}

export function setCachedFacturas(data: FacturaConCliente[]): void {
  const payload: CachePayload<FacturaConCliente[]> = { data, timestamp: Date.now() };
  inMemoryFacturas = payload;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CACHE_KEY_FACTURAS, JSON.stringify(payload));
    } catch (error) {
      console.warn('[flujoCajaCache] Error guardando facturas:', error);
    }
  }
}

// ── CLIENTES CACHE ──
export function getCachedClientes(): Cliente[] | null {
  if (inMemoryClientes && isCacheValid(inMemoryClientes.timestamp)) {
    return inMemoryClientes.data;
  }

  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY_CLIENTES);
    if (!raw) return null;

    const parsed: CachePayload<Cliente[]> = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && isCacheValid(parsed.timestamp)) {
      inMemoryClientes = parsed;
      return parsed.data;
    }
  } catch (error) {
    console.warn('[flujoCajaCache] Error leyendo clientes:', error);
  }

  return null;
}

export function setCachedClientes(data: Cliente[]): void {
  const payload: CachePayload<Cliente[]> = { data, timestamp: Date.now() };
  inMemoryClientes = payload;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CACHE_KEY_CLIENTES, JSON.stringify(payload));
    } catch (error) {
      console.warn('[flujoCajaCache] Error guardando clientes:', error);
    }
  }
}

// ── LOGS CACHE ──
export function getCachedSyncLogs(): SiigoSyncLog[] | null {
  if (inMemoryLogs && isCacheValid(inMemoryLogs.timestamp)) {
    return inMemoryLogs.data;
  }

  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY_LOGS);
    if (!raw) return null;

    const parsed: CachePayload<SiigoSyncLog[]> = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && isCacheValid(parsed.timestamp)) {
      inMemoryLogs = parsed;
      return parsed.data;
    }
  } catch (error) {
    console.warn('[flujoCajaCache] Error leyendo logs:', error);
  }

  return null;
}

export function setCachedSyncLogs(data: SiigoSyncLog[]): void {
  const payload: CachePayload<SiigoSyncLog[]> = { data, timestamp: Date.now() };
  inMemoryLogs = payload;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CACHE_KEY_LOGS, JSON.stringify(payload));
    } catch (error) {
      console.warn('[flujoCajaCache] Error guardando logs:', error);
    }
  }
}

// ── INVALIDEZ DE CACHÉ GLOBAL ──
export function clearProyeccionesCache(): void {
  inMemoryProyecciones = null;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(CACHE_KEY_PROYECCIONES);
    } catch (error) {
      console.warn('[flujoCajaCache] Error al limpiar proyecciones:', error);
    }
  }
}

export function clearAllFlujoCajaCache(): void {
  inMemoryProyecciones = null;
  inMemoryFacturas = null;
  inMemoryClientes = null;
  inMemoryLogs = null;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(CACHE_KEY_PROYECCIONES);
      window.sessionStorage.removeItem(CACHE_KEY_FACTURAS);
      window.sessionStorage.removeItem(CACHE_KEY_CLIENTES);
      window.sessionStorage.removeItem(CACHE_KEY_LOGS);
    } catch (error) {
      console.warn('[flujoCajaCache] Error al limpiar todo el caché:', error);
    }
  }
}
