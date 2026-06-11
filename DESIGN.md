# Diseño Técnico — Flujo de Caja Grupo Pospin

> **Clasificación: Tamaño M** (app/servicio — dashboard web con formularios, proyección y alertas)
> **Fecha**: 2026-06-11
> **Autor**: software-dev (kanban worker)
> **Estado**: ✅ APROBADO — Luz verde #2 recibida 2026-06-11
> **Addendum**: Las decisiones vinculantes de Santiago (Supabase + Auth + roles + Streamlit Community Cloud) reemplazan SQLite/sin-auth del diseño original. Ver sección 9.

---

## 1. Actores y Casos de Uso

| Actor | Descripción | Casos de uso |
|-------|-------------|-------------|
| **Administrador** (Rodrigo Pospin) | Dueño del negocio, configura la herramienta | Configurar cuentas bancarias, gestionar clientes, importar Excel inicial, definir compromisos |
| **Usuario** (empleado Pospin) | Actualiza datos semanalmente | Registrar saldos semanales, registrar recaudos, consultar proyección, ver alertas |

```
┌─────────────────────────────────────────────────────────┐
│                    ACTORES                               │
│                                                          │
│  [Administrador]          [Usuario]                      │
│       │                       │                          │
│       ├── Configurar cuentas  ├── Actualizar saldos      │
│       ├── Gestionar clientes  ├── Registrar recaudos     │
│       ├── Importar Excel      ├── Consultar proyección   │
│       ├── Crear compromisos   └── Ver alertas            │
│       └── Ver dashboard                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Arquitectura

**Stack: Streamlit + SQLite + openpyxl**

```
┌─────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA C4                           │
│                                                              │
│  [Rodrigo/Empleado]                                          │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────┐                                    │
│  │  Streamlit App       │  ← Dashboard + Formularios         │
│  │  (Python, browser)   │                                    │
│  └──────┬───────────────┘                                    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │  Motor de Proyección │───▶│  SQLite (flujo_caja.db)  │   │
│  │  (cálculos semanales)│    │  - cuentas               │   │
│  └──────┬───────────────┘    │  - clientes              │   │
│         │                    │  - facturas              │   │
│         ▼                    │  - compromisos           │   │
│  ┌──────────────────────┐    │  - saldos_semanales      │   │
│  │  Importador Excel    │    │  - recaudos              │   │
│  │  (openpyxl)          │    │  - egresos               │   │
│  └──────────────────────┘    └──────────────────────────┘   │
│                                                              │
│  Deploy: `streamlit run app.py` (local o servidor)          │
│  Requisitos: Python 3.10+, pip install streamlit openpyxl   │
└─────────────────────────────────────────────────────────────┘
```

**Por qué Streamlit:**
- Python puro → mismo lenguaje que el prototipo, curva de aprendizaje cero
- Dashboard nativo con gráficos (plotly), tablas interactivas, formularios
- Deploy con un comando: `streamlit run app.py`
- El cliente lo abre en el browser como cualquier página web
- No necesita servidor dedicado (corre en laptop del cliente)

**Por qué SQLite (no Supabase):**
- Es una herramienta personal/empresarial de un solo tenant
- Sin necesidad de autenticación multiusuario compleja
- El archivo .db se puede respaldar copiándolo
- Cero dependencias de internet — funciona offline

---

## 3. User Flows Principales

### Flow 1: Importación inicial de datos
```
[Abre app] → [Sidebar: Configuración] → [Sube Excel]
     → [Parser detecta hojas] → [Preview de datos]
     → [Confirma importación] → [Datos en BD]
     → [Dashboard muestra proyección]
```

### Flow 2: Actualización semanal (<15 min)
```
[Abre app] → [Dashboard: ve semana actual]
     → [Click "Actualizar semana"] → [Formulario: saldos por cuenta]
     → [Formulario: recaudos recibidos] → [Formulario: egresos ejecutados]
     → [Guarda] → [Proyección recalculada] → [Alertas actualizadas]
```

### Flow 3: Consulta de proyección
```
[Abre app] → [Dashboard principal]
     → [Vista tabla: 8+ semanas con saldo/recaudo/egresos]
     → [Vista gráfico: línea de saldo proyectado]
     → [Alertas rojas: semanas con déficit]
     → [Detalle por semana: drill-down]
```

---

## 4. Interfaz — Pantallas Clave

### 4.1 Dashboard Principal
```
┌─────────────────────────────────────────────────────────────┐
│  💰 FLUJO DE CAJA — GRUPO POSPIN          [Semana actual: 24]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🚨 ALERTAS (2 semanas en déficit)                    │    │
│  │  • Semana 26: Déficit $103M — revisar pagos         │    │
│  │  • Semana 27: Déficit $77M — acelerar recaudo       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  📊 SALDO PROYECTADO (próximas 12 semanas)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [Gráfico de línea: saldo semanal proyectado]       │    │
│  │   ^                                                 │    │
│  │   |     /\    /\                                    │    │
│  │   |    /  \  /  \_____                              │    │
│  │   |___/    \/         \____                         │    │
│  │   ────────────────────────────> semanas             │    │
│  │              ↑ déficit en rojo                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  📋 TABLA DE PROYECCIÓN SEMANAL                             │
│  ┌────────┬──────────┬──────────┬──────────┬──────────┐    │
│  │ Semana │ Saldo    │ Recaudo  │ Egresos  │ Saldo    │    │
│  │        │ Inicial  │          │          │ Final    │    │
│  ├────────┼──────────┼──────────┼──────────┼──────────┤    │
│  │ 24     │ 150M     │ 80M      │ 60M      │ 170M ✅  │    │
│  │ 25     │ 170M     │ 45M      │ 90M      │ 125M ✅  │    │
│  │ 26     │ 125M     │ 30M      │ 258M     │ -103M 🔴│    │
│  │ 27     │ -103M    │ 50M      │ 25M      │ -77M 🔴 │    │
│  └────────┴──────────┴──────────┴──────────┴──────────┘    │
│                                                              │
│  📊 SALDOS POR CUENTA          🧾 RECAUDO PENDIENTE         │
│  ┌──────────────┬────────┐     ┌──────────┬──────────┐     │
│  │ Cuenta       │ Saldo  │     │ Cliente  │ Pendient.│     │
│  │ 8001 Bancol. │ 85M    │     │ SOLLA    │ 9.5M     │     │
│  │ 8022 Daviv.  │ 45M    │     │ EL TESORO│ 156M     │     │
│  │ 8023 Bogotà  │ 20M    │     │ CONCONCR.│ 50.5M    │     │
│  │ TOTAL        │ 150M   │     │ TOTAL    │ 216M     │     │
│  └──────────────┴────────┘     └──────────┴──────────┘     │
└─────────────────────────────────────────────────────────────┘
│ Sidebar: [📊 Dashboard] [📝 Actualizar] [⚙️ Config] [📥 Import] │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Pantalla de Configuración
- CRUD de cuentas bancarias (nombre, banco, número)
- CRUD de clientes (nombre, contacto)
- CRUD de compromisos especiales (tercero, fecha, valor, prioridad)
- Categorías de egresos

### 4.3 Pantalla de Importación
- Upload de Excel
- Preview de datos detectados por hoja
- Mapeo de columnas (auto-detect + override manual)
- Confirmación y carga a BD

### 4.4 Pantalla de Actualización Semanal
- Selector de semana
- Formulario: saldos actuales por cuenta
- Formulario: recaudos recibidos (por factura)
- Formulario: egresos ejecutados (por categoría)
- Botón guardar → recálculo automático

---

## 5. Base de Datos (SQLite)

### 5a. Diagrama ER

```
cuentas_bancarias ||--o{ saldos_semanales : registra
clientes         ||--o{ facturas          : tiene
facturas         ||--o{ recaudos          : genera
categorías       ||--o{ egresos           : clasifica
semanas          ||--o{ saldos_semanales  : contiene
semanas          ||--o{ recaudos          : agrupa
semanas          ||--o{ egresos           : agrupa
compromisos      (independiente)
```

### 5b. Tablas

```sql
-- Cuentas bancarias
CREATE TABLE cuentas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,           -- "Cuenta 8001"
    banco       TEXT NOT NULL,           -- "Bancolombia"
    numero      TEXT NOT NULL UNIQUE,    -- "8001"
    activa      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Clientes
CREATE TABLE clientes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,
    contacto    TEXT,
    activo      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Facturas por cobrar
CREATE TABLE facturas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    numero          TEXT NOT NULL,           -- número de factura
    fecha_emision   TEXT NOT NULL,
    fecha_vencimiento TEXT NOT NULL,
    valor           REAL NOT NULL DEFAULT 0,
    estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','parcial','pagada','vencida')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Semanas de proyección (se generan automáticamente)
CREATE TABLE semanas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    numero      INTEGER NOT NULL,           -- número de semana (1-52)
    año         INTEGER NOT NULL,
    fecha_inicio TEXT NOT NULL,             -- lunes de la semana
    fecha_fin   TEXT NOT NULL,              -- domingo de la semana
    UNIQUE(año, numero)
);

-- Saldos bancarios por semana
CREATE TABLE saldos_semanales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    semana_id   INTEGER NOT NULL REFERENCES semanas(id),
    cuenta_id   INTEGER NOT NULL REFERENCES cuentas(id),
    saldo       REAL NOT NULL DEFAULT 0,
    UNIQUE(semana_id, cuenta_id)
);

-- Recaudos (pagos recibidos por factura por semana)
CREATE TABLE recaudos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    semana_id   INTEGER NOT NULL REFERENCES semanas(id),
    factura_id  INTEGER NOT NULL REFERENCES facturas(id),
    valor       REAL NOT NULL DEFAULT 0,
    fecha       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categorías de egresos
CREATE TABLE categorias_egreso (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,       -- "Nómina", "Proveedores", etc.
    tipo        TEXT NOT NULL DEFAULT 'terceros'
                CHECK (tipo IN ('terceros','socios','financieros')),
    activa      INTEGER NOT NULL DEFAULT 1
);

-- Egresos por semana y categoría
CREATE TABLE egresos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    semana_id       INTEGER NOT NULL REFERENCES semanas(id),
    categoria_id    INTEGER NOT NULL REFERENCES categorias_egreso(id),
    valor           REAL NOT NULL DEFAULT 0,
    descripcion     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(semana_id, categoria_id)
);

-- Compromisos especiales (obligaciones fijas con terceros)
CREATE TABLE compromisos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tercero     TEXT NOT NULL,           -- "BANCOLOMBIA"
    descripcion TEXT,
    fecha       TEXT NOT NULL,
    valor       REAL NOT NULL DEFAULT 0,
    prioridad   TEXT NOT NULL DEFAULT 'media'
                CHECK (prioridad IN ('alta','media','baja')),
    estado      TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','pagado','vencido')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Importaciones (registro de Excel importados)
CREATE TABLE importaciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    archivo     TEXT NOT NULL,
    fecha       TEXT NOT NULL DEFAULT (datetime('now')),
    hojas       TEXT,                    -- JSON con nombres de hojas
    registros   INTEGER NOT NULL DEFAULT 0,
    exitosa     INTEGER NOT NULL DEFAULT 1
);
```

### 5c. Índices
```sql
CREATE INDEX idx_saldos_semana ON saldos_semanales(semana_id);
CREATE INDEX idx_recaudos_semana ON recaudos(semana_id);
CREATE INDEX idx_recaudos_factura ON recaudos(factura_id);
CREATE INDEX idx_egresos_semana ON egresos(semana_id);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX idx_semanas_año ON semanas(año, numero);
```

### 5d. Nota sobre RLS
SQLite no tiene RLS nativo. Dado que es una herramienta single-tenant que corre en la máquina del cliente, no se requiere RLS. Si se migra a Supabase en el futuro, se necesitarían políticas por usuario.

---

## 6. UML de Clases (Estructura del Código)

```
app.py                      ← Entry point Streamlit
├── pages/
│   ├── dashboard.py        ← Vista principal (proyección + alertas)
│   ├── actualizar.py       ← Formulario actualización semanal
│   ├── configuracion.py    ← CRUD cuentas, clientes, categorías
│   ├── importar.py         ← Upload y parseo de Excel
│   └── compromisos.py      ← CRUD compromisos especiales
├── core/
│   ├── database.py         ← Conexión SQLite + migraciones
│   ├── models.py           ← Dataclasses: Cuenta, Cliente, Factura, etc.
│   ├── proyeccion.py       ← Motor de cálculo semanal
│   └── importer.py         ← Parser de Excel (adaptado del prototipo)
├── utils/
│   ├── format.py           ← Formato de dinero, fechas
│   └── alerts.py           ← Lógica de detección de déficits
└── data/
    └── flujo_caja.db       ← SQLite database (creada automáticamente)
```

### Clases principales:

```python
# core/models.py
@dataclass
class Cuenta:
    id: int; nombre: str; banco: str; numero: str; activa: bool

@dataclass
class Cliente:
    id: int; nombre: str; contacto: str; activo: bool

@dataclass
class Factura:
    id: int; cliente_id: int; numero: str; fecha_emision: str
    fecha_vencimiento: str; valor: float; estado: str

@dataclass
class Semana:
    id: int; numero: int; año: int; fecha_inicio: str; fecha_fin: str

@dataclass
class Compromiso:
    id: int; tercero: str; fecha: str; valor: float; prioridad: str

# core/proyeccion.py
class MotorProyeccion:
    """Calcula flujo de caja proyectado a N semanas."""
    def __init__(self, db: Database): ...
    def calcular(self, semanas: int = 12) -> list[dict]: ...
    def saldo_semana(self, semana_id: int) -> dict: ...
    def alertas(self) -> list[dict]: ...
```

---

## 7. Secuencias — Flujo Clave

### Proyección semanal
```
[Usuario abre Dashboard]
     │
     ▼
[Streamlit carga MotorProyeccion]
     │
     ▼
[Motor consulta: saldos_semanales + recaudos + egresos]
     │
     ▼
[Calcula: saldo_final = saldo_inicial + recaudo - egresos]
     │  para cada semana encadenada
     ▼
[Detecta semanas con saldo_final < 0 → alertas]
     │
     ▼
[Renderiza: tabla + gráfico + alertas]
```

---

## 8. Plan de Implementación

**Objetivo**: Dashboard web de flujo de caja proyectado, funcional y entregable al cliente.

### Alcance
- **IN**: Dashboard, formularios CRUD, importación Excel, proyección 8+ semanas, alertas
- **OUT**: Autenticación multiusuario, API REST, deploy en la nube, notificaciones push/email

### Fases

| # | Fase | Entregable | Estimado |
|---|------|-----------|----------|
| 1 | **Setup + BD** | Repo, estructura, SQLite schema, seed data | 30 min |
| 2 | **Core engine** | Motor de proyección + modelos + DB access | 1h |
| 3 | **Importador Excel** | Parser adaptado del prototipo → BD | 45 min |
| 4 | **Dashboard** | Streamlit: tablas, gráficos, alertas | 1h |
| 5 | **Formularios** | CRUD + actualización semanal | 1h |
| 6 | **Configuración** | Cuentas, clientes, categorías, compromisos | 45 min |
| 7 | **QA + Docs** | Verificación con Excel ejemplo, README usuario | 30 min |

**Total estimado: ~5.5 horas** (1 sesión de Antigravity CLI)

### Riesgos
| Riesgo | Mitigación |
|--------|-----------|
| El Excel del cliente cambia de formato | Importador con mapeo configurable, no hardcodeado |
| Cliente no tiene Python instalado | README con instalador paso a paso + opción de ejecutable .exe futuro |
| SQLite concurrente | No aplica — herramienta single-user |

### Supuestos
- El cliente tiene Python 3.10+ o puede instalarlo
- Un solo usuario activo a la vez
- El Excel base del cliente mantiene las 3 hojas principales (Bancos, Flujo, Compromisos)

---

## 9. Addendum — Decisiones Vinculantes de Santiago (2026-06-11)

Las siguientes decisiones del cliente reemplazan las opciones del diseño original:

| Aspecto | Diseño original (§2) | Decisión vinculante |
|---------|---------------------|---------------------|
| Base de datos | SQLite (single-file) | **Supabase (PostgreSQL)** |
| Autenticación | Sin auth | **Supabase Auth (email/password)** |
| Multi-usuario | No | **Sí, 3 roles: admin, editor, viewer** |
| Hosting | Local (`streamlit run`) | **Streamlit Community Cloud** |
| Export | No especificado | **Excel + PDF del reporte** |

### 9a. Roles y permisos

| Rol | Dashboard | CRUD datos | Import/Export | Config (cuentas, clientes, categorías) | Gestión usuarios |
|-----|-----------|-----------|---------------|----------------------------------------|-----------------|
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewer | ✅ (solo lectura) | ❌ | ❌ (solo export) | ❌ | ❌ |

### 9b. Schema adaptado a PostgreSQL + RLS

El schema SQLite (§5) se adapta a PostgreSQL con:
- `SERIAL PRIMARY KEY` en vez de `INTEGER PRIMARY KEY AUTOINCREMENT`
- `BOOLEAN` en vez de `INTEGER` para flags
- `NUMERIC(15,2)` en vez de `REAL` para valores monetarios
- `TIMESTAMPTZ DEFAULT NOW()` en vez de `TEXT DEFAULT datetime('now')`
- Tabla `user_profiles` vinculada a `auth.users` para roles
- `user_id UUID REFERENCES auth.users(id)` en tablas auditables
- **RLS habilitado en todas las tablas**: políticas por rol vía `auth.jwt() -> 'app_metadata' -> 'role'`

### 9c. Auth flow en Streamlit

1. Página de login: email + password → `supabase.auth.sign_in_with_password()`
2. Session JWT guardada en `st.session_state`
3. Rol consultado de `user_profiles` tras login
4. Sidebar muestra usuario + rol + botón logout
5. Cada página verifica `st.session_state.get("user")` antes de renderizar

### 9d. Deploy en Streamlit Community Cloud

- Repo en GitHub (público o privado con acceso)
- `requirements.txt` con: streamlit, supabase, openpyxl, plotly, pandas, fpdf2
- Secrets en Streamlit Cloud: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `.streamlit/config.toml` para configuración de theme

---

## Decisión pendiente

**✅ RESUELTO — Luz verde #2 recibida. Procediendo con implementación.**
