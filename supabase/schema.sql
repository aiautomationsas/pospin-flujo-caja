-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles linked to Supabase Auth
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cuentas bancarias
CREATE TABLE cuentas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    banco TEXT NOT NULL,
    numero TEXT NOT NULL UNIQUE,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    contacto TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Facturas por cobrar
CREATE TABLE facturas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    numero TEXT NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pagada','vencida')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semanas de proyección
CREATE TABLE semanas (
    id SERIAL PRIMARY KEY,
    numero INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    UNIQUE(anio, numero)
);

-- Saldos bancarios por semana
CREATE TABLE saldos_semanales (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES semanas(id),
    cuenta_id INTEGER NOT NULL REFERENCES cuentas(id),
    saldo NUMERIC(15,2) NOT NULL DEFAULT 0,
    UNIQUE(semana_id, cuenta_id)
);

-- Recaudos (pagos recibidos por factura por semana)
CREATE TABLE recaudos (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES semanas(id),
    factura_id INTEGER NOT NULL REFERENCES facturas(id),
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    fecha DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categorías de egresos
CREATE TABLE categorias_egreso (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL DEFAULT 'terceros' CHECK (tipo IN ('terceros','socios','financieros')),
    activa BOOLEAN NOT NULL DEFAULT true
);

-- Egresos por semana y categoría
CREATE TABLE egresos (
    id SERIAL PRIMARY KEY,
    semana_id INTEGER NOT NULL REFERENCES semanas(id),
    categoria_id INTEGER NOT NULL REFERENCES categorias_egreso(id),
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(semana_id, categoria_id)
);

-- Compromisos especiales
CREATE TABLE compromisos (
    id SERIAL PRIMARY KEY,
    tercero TEXT NOT NULL,
    descripcion TEXT,
    fecha DATE NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','vencido')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Importaciones (registro de Excel importados)
CREATE TABLE importaciones (
    id SERIAL PRIMARY KEY,
    archivo TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hojas TEXT,
    registros INTEGER NOT NULL DEFAULT 0,
    exitosa BOOLEAN NOT NULL DEFAULT true
);

-- Indexes
CREATE INDEX idx_saldos_semana ON saldos_semanales(semana_id);
CREATE INDEX idx_recaudos_semana ON recaudos(semana_id);
CREATE INDEX idx_recaudos_factura ON recaudos(factura_id);
CREATE INDEX idx_egresos_semana ON egresos(semana_id);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX idx_semanas_anio ON semanas(anio, numero);

-- RLS: Enable on all tables
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_semanales ENABLE ROW LEVEL SECURITY;
ALTER TABLE recaudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_egreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compromisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: all authenticated users can read all data
CREATE POLICY "Authenticated users can read all" ON cuentas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON facturas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON semanas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON saldos_semanales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON recaudos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON categorias_egreso FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON egresos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON compromisos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all" ON importaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);

-- RLS Policies: admin and editor can insert/update
CREATE POLICY "Admin+Editor can insert" ON cuentas FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON cuentas FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON clientes FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON clientes FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON facturas FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON facturas FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can delete" ON facturas FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON saldos_semanales FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON saldos_semanales FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON recaudos FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON recaudos FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can delete" ON recaudos FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON egresos FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON egresos FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can delete" ON egresos FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON compromisos FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON compromisos FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can delete" ON compromisos FOR DELETE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON semanas FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON semanas FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON categorias_egreso FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));
CREATE POLICY "Admin+Editor can update" ON categorias_egreso FOR UPDATE TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

CREATE POLICY "Admin+Editor can insert" ON importaciones FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'editor'));

-- Admin-only: user_profiles management
CREATE POLICY "Admin can manage user profiles" ON user_profiles FOR ALL TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin');
