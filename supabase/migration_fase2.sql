-- 1. Tabla de Egresos Recurrentes
CREATE TABLE IF NOT EXISTS egresos_recurrentes (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER NOT NULL REFERENCES categorias_egreso(id),
    tercero TEXT NOT NULL,
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('semanal', 'quincenal', 'mensual', 'semestral', 'anual')),
    dia_pago INTEGER NOT NULL, -- 1-31 para mensual, 1-7 para semanal (L-D)
    monto_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS y políticas
ALTER TABLE egresos_recurrentes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'egresos_recurrentes' AND policyname = 'Authenticated users can read all') THEN
        CREATE POLICY "Authenticated users can read all" ON egresos_recurrentes FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'egresos_recurrentes' AND policyname = 'Admin+Editor can insert') THEN
        CREATE POLICY "Admin+Editor can insert" ON egresos_recurrentes FOR INSERT TO authenticated WITH CHECK (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'egresos_recurrentes' AND policyname = 'Admin+Editor can update') THEN
        CREATE POLICY "Admin+Editor can update" ON egresos_recurrentes FOR UPDATE TO authenticated USING (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'egresos_recurrentes' AND policyname = 'Admin+Editor can delete') THEN
        CREATE POLICY "Admin+Editor can delete" ON egresos_recurrentes FOR DELETE TO authenticated USING (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
END $$;

-- 2. Modificación de Facturas: Agregar fecha estimada de recaudo
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturas' AND column_name='fecha_estimada_recaudo') THEN
        ALTER TABLE facturas ADD COLUMN fecha_estimada_recaudo DATE;
        UPDATE facturas SET fecha_estimada_recaudo = fecha_vencimiento WHERE fecha_estimada_recaudo IS NULL;
        ALTER TABLE facturas ALTER COLUMN fecha_estimada_recaudo SET NOT NULL;
    END IF;
END $$;

-- 3. Tabla de Snapshots para Calibración (Estimado vs Real)
CREATE TABLE IF NOT EXISTS snapshots_proyeccion (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES semanas(id) UNIQUE,
    recaudo_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    egresos_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_final_estimado NUMERIC(15,2) NOT NULL DEFAULT 0,
    congelado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS y políticas
ALTER TABLE snapshots_proyeccion ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'snapshots_proyeccion' AND policyname = 'Authenticated users can read all') THEN
        CREATE POLICY "Authenticated users can read all" ON snapshots_proyeccion FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'snapshots_proyeccion' AND policyname = 'Admin+Editor can insert') THEN
        CREATE POLICY "Admin+Editor can insert" ON snapshots_proyeccion FOR INSERT TO authenticated WITH CHECK (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'snapshots_proyeccion' AND policyname = 'Admin+Editor can update') THEN
        CREATE POLICY "Admin+Editor can update" ON snapshots_proyeccion FOR UPDATE TO authenticated USING (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
END $$;

-- 4. Tabla de Logs de Sincronización SIIGO
CREATE TABLE IF NOT EXISTS siigo_sync_logs (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clientes_creados INTEGER NOT NULL DEFAULT 0,
    facturas_creadas INTEGER NOT NULL DEFAULT 0,
    facturas_actualizadas INTEGER NOT NULL DEFAULT 0,
    exitosa BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS y políticas
ALTER TABLE siigo_sync_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'siigo_sync_logs' AND policyname = 'Authenticated users can read all') THEN
        CREATE POLICY "Authenticated users can read all" ON siigo_sync_logs FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'siigo_sync_logs' AND policyname = 'Admin+Editor can insert') THEN
        CREATE POLICY "Admin+Editor can insert" ON siigo_sync_logs FOR INSERT TO authenticated WITH CHECK (
            (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
    END IF;
END $$;

