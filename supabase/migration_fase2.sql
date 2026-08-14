-- =================================================================
-- MIGRACIÓN Y POLÍTICAS DE SEGURIDAD RLS (SUPABASE / POSTGRES)
-- Habilita lectura pública/autenticada para el módulo de Flujo de Caja
-- =================================================================

-- 1. Tabla de Cuentas Bancarias
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

ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON cuentas_bancarias;
CREATE POLICY "Allow select for all roles" ON cuentas_bancarias FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON cuentas_bancarias;
CREATE POLICY "Allow all for authenticated" ON cuentas_bancarias FOR ALL TO anon, authenticated USING (true);

-- 2. Tabla de Semanas
CREATE TABLE IF NOT EXISTS semanas (
    id SERIAL PRIMARY KEY,
    numero INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL
);

ALTER TABLE semanas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON semanas;
CREATE POLICY "Allow select for all roles" ON semanas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON semanas;
CREATE POLICY "Allow all for authenticated" ON semanas FOR ALL TO anon, authenticated USING (true);

-- 3. Tabla de Egresos Recurrentes
CREATE TABLE IF NOT EXISTS egresos_recurrentes (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER,
    tercero TEXT NOT NULL,
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('semanal', 'quincenal', 'mensual', 'semestral', 'anual')),
    dia_pago INTEGER NOT NULL,
    monto_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE egresos_recurrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON egresos_recurrentes;
CREATE POLICY "Allow select for all roles" ON egresos_recurrentes FOR SELECT TO anon, authenticated USING (true);

-- 4. Modificación de Facturas: Agregar fecha estimada de recaudo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='fecha_estimada_recaudo') THEN
        ALTER TABLE facturas ADD COLUMN fecha_estimada_recaudo DATE;
        UPDATE facturas SET fecha_estimada_recaudo = fecha_vencimiento WHERE fecha_estimada_recaudo IS NULL;
    END IF;
END $$;

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON facturas;
CREATE POLICY "Allow select for all roles" ON facturas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON facturas;
CREATE POLICY "Allow all for authenticated" ON facturas FOR ALL TO anon, authenticated USING (true);

-- 5. Clientes, Recaudos, Egresos, Compromisos, Saldos Semanales
ALTER TABLE IF EXISTS clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON clientes;
CREATE POLICY "Allow select for all roles" ON clientes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON clientes;
CREATE POLICY "Allow all for authenticated" ON clientes FOR ALL TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS recaudos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON recaudos;
CREATE POLICY "Allow select for all roles" ON recaudos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON recaudos;
CREATE POLICY "Allow all for authenticated" ON recaudos FOR ALL TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS egresos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON egresos;
CREATE POLICY "Allow select for all roles" ON egresos FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS compromisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON compromisos;
CREATE POLICY "Allow select for all roles" ON compromisos FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS saldos_semanales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON saldos_semanales;
CREATE POLICY "Allow select for all roles" ON saldos_semanales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON saldos_semanales;
CREATE POLICY "Allow all for authenticated" ON saldos_semanales FOR ALL TO anon, authenticated USING (true);

-- 6. Logs de Sincronización SIIGO
CREATE TABLE IF NOT EXISTS siigo_sync_logs (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clientes_creados INTEGER NOT NULL DEFAULT 0,
    facturas_creadas INTEGER NOT NULL DEFAULT 0,
    facturas_actualizadas INTEGER NOT NULL DEFAULT 0,
    exitosa BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    usuario_id UUID
);

ALTER TABLE siigo_sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON siigo_sync_logs;
CREATE POLICY "Allow select for all roles" ON siigo_sync_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON siigo_sync_logs;
CREATE POLICY "Allow all for authenticated" ON siigo_sync_logs FOR ALL TO anon, authenticated USING (true);
