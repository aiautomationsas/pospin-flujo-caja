-- =================================================================
-- CREACIÓN COMPLETA DE TABLAS Y POLÍTICAS RLS EN SUPABASE POSTGRES
-- Módulo de Flujo de Caja (Grupo Pospin)
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

-- Insertar datos iniciales si está vacía
INSERT INTO cuentas_bancarias (nombre, banco, numero, tipo_cuenta, saldo, activa)
SELECT 'Bancolombia Principal', 'Bancolombia', '*4589', 'corriente', 120000000.00, true
WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE numero = '*4589');

INSERT INTO cuentas_bancarias (nombre, banco, numero, tipo_cuenta, saldo, activa)
SELECT 'Davivienda Reserva', 'Davivienda', '*1042', 'ahorros', 45000000.00, true
WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE numero = '*1042');

INSERT INTO cuentas_bancarias (nombre, banco, numero, tipo_cuenta, saldo, activa)
SELECT 'Banco de Bogotá Operativa', 'Banco de Bogotá', '*8812', 'corriente', 15000000.00, true
WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE numero = '*8812');

INSERT INTO cuentas_bancarias (nombre, banco, numero, tipo_cuenta, saldo, activa)
SELECT 'Caja General / Menor', 'Caja', 'Caja-01', 'caja', 5000000.00, true
WHERE NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE numero = 'Caja-01');

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

-- 3. Tabla de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    contacto TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON clientes;
CREATE POLICY "Allow select for all roles" ON clientes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON clientes;
CREATE POLICY "Allow all for authenticated" ON clientes FOR ALL TO anon, authenticated USING (true);

-- 4. Tabla de Facturas
CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    numero TEXT NOT NULL UNIQUE,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    fecha_estimada_recaudo DATE NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'parcial', 'pagada', 'vencida')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON facturas;
CREATE POLICY "Allow select for all roles" ON facturas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON facturas;
CREATE POLICY "Allow all for authenticated" ON facturas FOR ALL TO anon, authenticated USING (true);

-- 5. Tabla de Recaudos
CREATE TABLE IF NOT EXISTS recaudos (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE,
    semana_id INTEGER REFERENCES semanas(id) ON DELETE CASCADE,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    fecha DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recaudos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON recaudos;
CREATE POLICY "Allow select for all roles" ON recaudos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON recaudos;
CREATE POLICY "Allow all for authenticated" ON recaudos FOR ALL TO anon, authenticated USING (true);

-- 6. Tabla de Categorías de Egreso
CREATE TABLE IF NOT EXISTS categorias_egreso (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('terceros', 'socios', 'financieros')),
    activa BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE categorias_egreso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON categorias_egreso;
CREATE POLICY "Allow select for all roles" ON categorias_egreso FOR SELECT TO anon, authenticated USING (true);

-- 7. Tabla de Egresos
CREATE TABLE IF NOT EXISTS egresos (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER REFERENCES semanas(id) ON DELETE CASCADE,
    categoria_id INTEGER REFERENCES categorias_egreso(id) ON DELETE CASCADE,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON egresos;
CREATE POLICY "Allow select for all roles" ON egresos FOR SELECT TO anon, authenticated USING (true);

-- 8. Tabla de Compromisos
CREATE TABLE IF NOT EXISTS compromisos (
    id SERIAL PRIMARY KEY,
    tercero TEXT NOT NULL,
    descripcion TEXT,
    fecha DATE NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    prioridad TEXT NOT NULL CHECK (prioridad IN ('alta', 'media', 'baja')),
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'pagado', 'vencido')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE compromisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON compromisos;
CREATE POLICY "Allow select for all roles" ON compromisos FOR SELECT TO anon, authenticated USING (true);

-- 9. Tabla de Saldos Semanales
CREATE TABLE IF NOT EXISTS saldos_semanales (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL UNIQUE,
    cuenta_id INTEGER REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
    saldo NUMERIC(15,2) NOT NULL DEFAULT 0
);

ALTER TABLE saldos_semanales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for all roles" ON saldos_semanales;
CREATE POLICY "Allow select for all roles" ON saldos_semanales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow all for authenticated" ON saldos_semanales;
CREATE POLICY "Allow all for authenticated" ON saldos_semanales FOR ALL TO anon, authenticated USING (true);

-- 10. Tabla de Logs de Sincronización SIIGO
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
