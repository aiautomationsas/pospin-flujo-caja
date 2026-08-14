# Plan de Implementación: Migración e Integración de Flujo de Caja a Sitio Web Grupo Pospin (Next.js / React)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el módulo de Flujo de Caja desde el prototipo Streamlit a una suite/sección nativa dentro del sitio web corporativo de Grupo Pospin (`https://github.com/aiautomationsas/grupopospin`), desarrollada en Next.js/React con Supabase Auth (sesión unificada) y API Routes para SIIGO.

**Architecture:** El módulo de Flujo de Caja pasará a ser una sección dentro de `grupopospin` (ej. `/dashboard/flujo-caja`), utilizando React Server Components / Server Actions de Next.js, Supabase para autenticación compartida y persistencia PostgreSQL, y Recharts/Tremor/Chart.js para las gráficas interactivas de proyección. La integración con SIIGO se ejecutará vía Next.js API Routes / Server Actions.

**Tech Stack:** Next.js, React, TypeScript/JavaScript, TailwindCSS, Supabase Auth & DB, SIIGO API (Node.js/Next.js API Routes), Recharts/Tremor.

---

## Global Constraints

- **Sesión Unificada**: Toda la suite utilizará Supabase Auth. La autenticación para el sitio web y el módulo de flujo de caja es compartida (mismo login).
- **Consistencia Visual**: El diseño UI utilizará las guías y sistema de diseño existentes en `grupopospin` (TailwindCSS, componentes premium).
- **Paridad de Lógica Financiera**: La lógica de cálculo de saldos semanales, proyección acumulada y estados de cartera se portará fielmente de `core/proyeccion.py` a TypeScript.
- **Seguridad en API Keys**: Credenciales de SIIGO API protegidas mediante variables de entorno en servidor (`.env.local` / Vercel secrets).

---

### Task 1: Mapeo de Lógica y Migración de Esquema Supabase

**Files:**
- Create/Modify en `grupopospin`: `types/flujo_caja.ts` (Modelos de datos: Factura, Recaudo, Compromiso, Cliente)
- Modify en Supabase: Aplicar `supabase/migration_fase2.sql` para soportar clientes, facturas de venta y logs de SIIGO.

**Interfaces:**
- Consumes: Esquema Postgres existente en Supabase.
- Produces: Tipos TypeScript fuertemente tipados (`Factura`, `Recaudo`, `Compromiso`, `ProyeccionSemanal`).

- [ ] **Step 1: Aplicar migración SQL en Supabase**
  - Ejecutar los scripts de estructura e índices en la base de datos de producción Supabase.

- [ ] **Step 2: Crear definiciones de tipos en TypeScript (`types/flujo_caja.ts`)**
  - Definir interfaces para facturas, recaudos, egresos, compromisos y resumen semanal.

---

### Task 2: Portar Lógica de Negocio y Cliente SIIGO API a Next.js (Server Actions / API Routes)

**Files:**
- Create en `grupopospin`: `lib/siigo.ts` (Cliente oficial API SIIGO en Node.js/TS)
- Create en `grupopospin`: `lib/flujo_caja_engine.ts` (Motor de proyección de saldo inicial, egresos y recaudos semanales)
- Create en `grupopospin`: `app/api/siigo/sync/route.ts` (Endpoint para sincronización masiva)

**Interfaces:**
- Consumes: Credenciales SIIGO (`SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_PARTNER_ID`).
- Produces: `syncSiigoCartera()`, `calcularProyeccionFlujoCaja(semanas)`.

- [ ] **Step 1: Implementar cliente SIIGO API en `lib/siigo.ts`**
  - Manejo de autenticación por Token, renovación automática y paginación de facturas/clientes.

- [ ] **Step 2: Portar algoritmo de proyección en `lib/flujo_caja_engine.ts`**
  - Agrupación por semanas, cálculo de saldo proyectado y balance final.

---

### Task 3: Desarrollo de UI/Páginas del Módulo de Flujo de Caja en `grupopospin`

**Files:**
- Create en `grupopospin`: `app/(dashboard)/flujo-caja/page.tsx` (Dashboard de métricas + Gráfica de proyección)
- Create en `grupopospin`: `app/(dashboard)/flujo-caja/facturas/page.tsx` (Gestión CRUD de Facturas y Recaudos)
- Create en `grupopospin`: `app/(dashboard)/flujo-caja/importar/page.tsx` (Sincronización SIIGO API + Carga Excel)
- Create en `grupopospin`: `components/flujo-caja/ChartProyeccion.tsx` (Gráfica interactiva con Recharts/Tremor)

**Interfaces:**
- Consumes: Componentes UI de `grupopospin`, contexto de usuario autenticado de Supabase Auth.
- Produces: Vistas interactivas de Flujo de Caja integradas al menú principal de `grupopospin`.

- [ ] **Step 1: Crear layout y dashboard de Flujo de Caja**
  - Renderizar tarjetas KPI (Saldo Inicial, Recaudo Proyectado, Compromisos, Saldo Final) y gráfica interactiva.

- [ ] **Step 2: Crear tabla de facturas con modal de creación/edición y registro de recaudos**
  - Implementar filtros por estado (Pendiente, Parcial, Pagada, Vencida) y modal para abonar recaudos.

- [ ] **Step 3: Crear página de Sincronización e Importación**
  - Botón de disparo de sincronización con SIIGO API y visualizador de logs/historial.

---

### Task 4: Pruebas de Sesión Unificada (Supabase Auth) y Despliegue en Vercel

**Files:**
- Modify en `grupopospin`: `middleware.ts` (Proteger rutas `/flujo-caja/*` con Supabase Auth)
- Modify en `grupopospin`: `components/Sidebar.tsx` o `Header.tsx` (Añadir ítem de menú "Flujo de Caja")

**Interfaces:**
- Consumes: Supabase Session middleware.
- Produces: Acceso transparente y protegido al módulo financiero para usuarios autenticados.

- [ ] **Step 1: Probar flujo de autenticación único**
  - Verificar que el usuario inicia sesión una sola vez en `grupopospin` y puede acceder inmediatamente a Flujo de Caja.

- [ ] **Step 2: Despliegue de producción en Vercel / Servidor**
  - Configurar las variables de entorno de producción y desplegar la versión unificada.
