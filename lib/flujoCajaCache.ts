import type { ProyeccionSemanal } from '@/types/flujo_caja';

export const CACHE_KEY = 'pospin_flujo_caja_proyecciones_v1';
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos en milisegundos

interface CachePayload {
  data: ProyeccionSemanal[];
  timestamp: number;
}

let inMemoryCache: CachePayload | null = null;

/**
 * Verifica si una marca de tiempo está dentro del tiempo de vida válido (TTL).
 */
export function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL_MS;
}

/**
 * Obtiene las proyecciones semanales almacenadas en caché (in-memory o sessionStorage).
 * Retorna `null` si no hay datos válidos o si la caché expiró.
 */
export function getCachedProyecciones(): ProyeccionSemanal[] | null {
  // 1. Intentar leer de la caché en memoria
  if (inMemoryCache && isCacheValid(inMemoryCache.timestamp)) {
    return inMemoryCache.data;
  }

  // 2. Si no está en memoria o expiró, verificar sessionStorage en el cliente
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: CachePayload = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && typeof parsed.timestamp === 'number') {
      if (isCacheValid(parsed.timestamp)) {
        // Sincronizar en memoria para lecturas instantáneas
        inMemoryCache = parsed;
        return parsed.data;
      }
      // Limpiar entrada expirada
      window.sessionStorage.removeItem(CACHE_KEY);
    }
  } catch (error) {
    console.warn('[flujoCajaCache] Error al leer desde sessionStorage:', error);
  }

  return null;
}

/**
 * Guarda las proyecciones en caché en memoria y en sessionStorage.
 */
export function setCachedProyecciones(data: ProyeccionSemanal[]): void {
  const payload: CachePayload = {
    data,
    timestamp: Date.now(),
  };

  inMemoryCache = payload;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[flujoCajaCache] Error al persistir en sessionStorage:', error);
    }
  }
}

/**
 * Invalida y remueve la caché tanto en memoria como en sessionStorage.
 */
export function clearProyeccionesCache(): void {
  inMemoryCache = null;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.warn('[flujoCajaCache] Error al limpiar sessionStorage:', error);
    }
  }
}
