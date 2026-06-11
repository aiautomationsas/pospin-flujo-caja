# 💰 Flujo de Caja — Grupo Pospin

Aplicación web para la proyección de flujo de caja semanal del Grupo Pospin. Permite gestionar cuentas bancarias, clientes, facturas, egresos y compromisos, con proyección automática a 12 semanas y alertas de déficit.

## 📸 Capturas de Pantalla

<!-- TODO: Agregar capturas cuando la app esté desplegada -->

## ✅ Requisitos

- **Python 3.10+**
- **Cuenta de Supabase** (gratuita en [supabase.com](https://supabase.com))
- Navegador web moderno

## 🚀 Instalación Paso a Paso

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd pospin-flujo-caja
```

### 2. Crear entorno virtual e instalar dependencias

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

pip install -r requirements.txt
```

### 3. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un proyecto nuevo.
2. Esperar a que se inicialice la base de datos.

### 4. Ejecutar el esquema SQL

1. En el panel de Supabase, ir a **SQL Editor**.
2. Copiar y pegar el contenido de `supabase/schema.sql`.
3. Ejecutar el script completo.

### 5. Crear usuario administrador en Supabase Auth

1. Ir a **Authentication → Users** en el panel de Supabase.
2. Hacer clic en **Add user → Create new user**.
3. Ingresar correo y contraseña para el admin.

### 6. Insertar perfil de usuario admin

En el **SQL Editor** de Supabase, ejecutar:

```sql
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Administrador', 'admin'
FROM auth.users
WHERE email = 'tu-correo@empresa.com';
```

> Reemplaza `tu-correo@empresa.com` con el correo del paso anterior.

### 7. Configurar credenciales

Crear el archivo `.streamlit/secrets.toml`:

```toml
SUPABASE_URL = "https://tu-proyecto.supabase.co"
SUPABASE_ANON_KEY = "tu-anon-key"
SUPABASE_SERVICE_ROLE_KEY = "tu-service-role-key"
```

> Los valores se encuentran en **Supabase → Settings → API**.

### 8. Ejecutar la aplicación

```bash
streamlit run app.py
```

La app estará disponible en `http://localhost:8501`.

## ☁️ Deploy en Streamlit Community Cloud

1. Subir el código a GitHub.
2. Ir a [share.streamlit.io](https://share.streamlit.io).
3. Hacer clic en **New app**.
4. Seleccionar el repositorio y branch.
5. En **Advanced settings → Secrets**, agregar:
   ```
   SUPABASE_URL = "https://tu-proyecto.supabase.co"
   SUPABASE_ANON_KEY = "tu-anon-key"
   SUPABASE_SERVICE_ROLE_KEY = "tu-service-role-key"
   ```
6. Hacer clic en **Deploy**.

## 👥 Uso por Rol

### Administrador
- Acceso completo: Dashboard, Actualizar, Importar, Compromisos, Configuración
- Puede agregar/editar/desactivar cuentas, clientes y categorías
- Puede cambiar roles de otros usuarios
- Puede importar datos desde Excel

### Editor
- Puede actualizar datos semanales (saldos, recaudos, egresos)
- Puede importar/exportar datos
- Puede gestionar compromisos
- No puede modificar configuración ni usuarios

### Viewer (Solo Lectura)
- Solo acceso al Dashboard
- Puede exportar reportes (Excel/PDF)
- No puede modificar ningún dato

## 📁 Estructura del Proyecto

```
pospin-flujo-caja/
├── app.py                  # Entry point — login y navegación
├── requirements.txt        # Dependencias Python
├── .streamlit/
│   └── config.toml         # Configuración Streamlit
├── pages/
│   ├── dashboard.py        # Dashboard principal con gráficas y alertas
│   ├── actualizar.py       # Actualización semanal de datos
│   ├── importar.py         # Importación desde Excel
│   ├── compromisos.py      # CRUD de compromisos especiales
│   └── configuracion.py    # Administración (solo admin)
├── core/
│   ├── database.py         # Cliente Supabase
│   ├── auth.py             # Autenticación y roles
│   ├── models.py           # Dataclasses del esquema
│   ├── proyeccion.py       # Motor de proyección de flujo
│   └── importer.py         # Parser e importador de Excel
├── utils/
│   ├── format.py           # Formateo de moneda y fechas
│   ├── alerts.py           # Detección de déficit
│   └── export.py           # Exportación Excel y PDF
└── supabase/
    └── schema.sql          # Esquema PostgreSQL completo
```

## 🛠️ Tecnologías

- **Frontend:** [Streamlit](https://streamlit.io)
- **Base de datos:** [Supabase](https://supabase.com) (PostgreSQL)
- **Gráficas:** [Plotly](https://plotly.com)
- **Exportación:** openpyxl (Excel), fpdf2 (PDF)

## 📝 Licencia

Proyecto privado — Grupo Pospin. Todos los derechos reservados.
