-- Migration: Obligations, Recurring Expenses, and Projections SSOT
-- Enables full Accounts Payable (Cuentas por Pagar) management and DB SSOT projection.

-- 1. Cuentas Bancarias
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    banco TEXT NOT NULL,
    numero TEXT NOT NULL,
    tipo_cuenta TEXT NOT NULL DEFAULT 'corriente',
    saldo NUMERIC(15,2) NOT NULL DEFAULT 0,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Egresos Recurrentes (plantillas de costos fijos)
CREATE TABLE IF NOT EXISTS egresos_recurrentes (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER REFERENCES categorias_egreso(id) ON DELETE SET NULL,
    tercero TEXT NOT NULL,
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('semanal', 'quincenal', 'mensual', 'semestral', 'anual')),
    dia_pago INTEGER NOT NULL DEFAULT 1,
    monto_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabla de Obligaciones (Cuentas por Pagar)
CREATE TABLE IF NOT EXISTS obligaciones (
    id SERIAL PRIMARY KEY,
    tercero TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias_egreso(id) ON DELETE SET NULL,
    concepto TEXT NOT NULL,
    monto_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_pendiente NUMERIC(15,2) NOT NULL DEFAULT 0,
    fecha_vencimiento DATE NOT NULL,
    fecha_programada_pago DATE NOT NULL,
    frecuencia TEXT NOT NULL DEFAULT 'unica' CHECK (frecuencia IN ('unica', 'semanal', 'quincenal', 'mensual', 'semestral', 'anual')),
    prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'baja')),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'parcial', 'pagada', 'vencida', 'reprogramada')),
    cuenta_origen_id INTEGER REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla de Pagos de Obligaciones (Trazabilidad de ejecuciones reales)
CREATE TABLE IF NOT EXISTS pagos_obligaciones (
    id SERIAL PRIMARY KEY,
    obligacion_id INTEGER NOT NULL REFERENCES obligaciones(id) ON DELETE CASCADE,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
    semana_id INTEGER REFERENCES semanas(id) ON DELETE SET NULL,
    monto_pagado NUMERIC(15,2) NOT NULL DEFAULT 0,
    fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
    comprobante_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabla de Snapshots de Proyección (Congelar estimaciones históricas)
CREATE TABLE IF NOT EXISTS snapshots_proyeccion (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES semanas(id) ON DELETE CASCADE,
    recaudo_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    egresos_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_final_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    congelado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(semana_id, congelado_at)
);

-- Indices para acelerar proyecciones
CREATE INDEX IF NOT EXISTS idx_obligaciones_fecha_prog ON obligaciones(fecha_programada_pago);
CREATE INDEX IF NOT EXISTS idx_obligaciones_estado ON obligaciones(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_obligaciones_semana ON pagos_obligaciones(semana_id);
CREATE INDEX IF NOT EXISTS idx_pagos_obligaciones_cuenta ON pagos_obligaciones(cuenta_id);

-- RLS Enablement
ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE egresos_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_obligaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots_proyeccion ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can read all
DROP POLICY IF EXISTS "Authenticated users can read all" ON cuentas_bancarias;
CREATE POLICY "Authenticated users can read all" ON cuentas_bancarias FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read all" ON egresos_recurrentes;
CREATE POLICY "Authenticated users can read all" ON egresos_recurrentes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read all" ON obligaciones;
CREATE POLICY "Authenticated users can read all" ON obligaciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read all" ON pagos_obligaciones;
CREATE POLICY "Authenticated users can read all" ON pagos_obligaciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can read all" ON snapshots_proyeccion;
CREATE POLICY "Authenticated users can read all" ON snapshots_proyeccion FOR SELECT TO authenticated USING (true);

-- RLS Write Policies: Admin + Editor
DROP POLICY IF EXISTS "Admin+Editor can insert" ON cuentas_bancarias;
CREATE POLICY "Admin+Editor can insert" ON cuentas_bancarias FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can update" ON cuentas_bancarias;
CREATE POLICY "Admin+Editor can update" ON cuentas_bancarias FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can delete" ON cuentas_bancarias;
CREATE POLICY "Admin+Editor can delete" ON cuentas_bancarias FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "Admin+Editor can insert" ON egresos_recurrentes;
CREATE POLICY "Admin+Editor can insert" ON egresos_recurrentes FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can update" ON egresos_recurrentes;
CREATE POLICY "Admin+Editor can update" ON egresos_recurrentes FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can delete" ON egresos_recurrentes;
CREATE POLICY "Admin+Editor can delete" ON egresos_recurrentes FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "Admin+Editor can insert" ON obligaciones;
CREATE POLICY "Admin+Editor can insert" ON obligaciones FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can update" ON obligaciones;
CREATE POLICY "Admin+Editor can update" ON obligaciones FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can delete" ON obligaciones;
CREATE POLICY "Admin+Editor can delete" ON obligaciones FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "Admin+Editor can insert" ON pagos_obligaciones;
CREATE POLICY "Admin+Editor can insert" ON pagos_obligaciones FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can update" ON pagos_obligaciones;
CREATE POLICY "Admin+Editor can update" ON pagos_obligaciones FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can delete" ON pagos_obligaciones;
CREATE POLICY "Admin+Editor can delete" ON pagos_obligaciones FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "Admin+Editor can insert" ON snapshots_proyeccion;
CREATE POLICY "Admin+Editor can insert" ON snapshots_proyeccion FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can update" ON snapshots_proyeccion;
CREATE POLICY "Admin+Editor can update" ON snapshots_proyeccion FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
DROP POLICY IF EXISTS "Admin+Editor can delete" ON snapshots_proyeccion;
CREATE POLICY "Admin+Editor can delete" ON snapshots_proyeccion FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
