"""
Poblar Supabase con datos demo realistas para Grupo Pospin.
Uso: python seed_fake_data.py
Requiere: .streamlit/secrets.toml con SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
"""
import os
import sys
import toml
from datetime import date, timedelta
from supabase import create_client

# --- Leer credenciales desde secrets.toml ---
secrets_path = ".streamlit/secrets.toml"
if not os.path.exists(secrets_path):
    print(f"ERROR: no se encontró {secrets_path}")
    sys.exit(1)

secrets = toml.load(secrets_path)
url = secrets["SUPABASE_URL"]
key = secrets["SUPABASE_SERVICE_ROLE_KEY"]  # service role para bypass RLS
supabase = create_client(url, key)

HOY = date(2026, 6, 25)

def lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())

# Semana actual = semana 0, generamos semana -1 (pasada) y semanas 0..7 (futuras)
semanas_def = []
base = lunes(HOY) - timedelta(weeks=1)
for i in range(10):
    inicio = base + timedelta(weeks=i)
    fin = inicio + timedelta(days=6)
    iso = inicio.isocalendar()
    semanas_def.append({"numero": iso[1], "anio": iso[0], "fecha_inicio": str(inicio), "fecha_fin": str(fin)})

print("Insertando semanas...")
res = supabase.table("semanas").insert(semanas_def).execute()
semana_ids = {(r["anio"], r["numero"]): r["id"] for r in res.data}
semana_lista = sorted(semana_ids.items())  # lista ordenada (anio,num) -> id

# --- Cuentas ---
print("Insertando cuentas...")
cuentas_data = [
    {"nombre": "Cuenta Operativa", "banco": "Bancolombia", "numero": "001-123456"},
    {"nombre": "Cuenta Nómina",    "banco": "Davivienda",   "numero": "002-654321"},
]
res = supabase.table("cuentas").insert(cuentas_data).execute()
cuenta_ids = [r["id"] for r in res.data]

# --- Clientes ---
print("Insertando clientes...")
clientes_data = [
    {"nombre": "Constructora Andina S.A.S", "contacto": "Carlos Mejía"},
    {"nombre": "Inmobiliaria del Valle",     "contacto": "Lucia Torres"},
    {"nombre": "Proyectos Urbanos Ltda",     "contacto": "Andrés Ríos"},
]
res = supabase.table("clientes").insert(clientes_data).execute()
cliente_ids = [r["id"] for r in res.data]

# --- Facturas ---
print("Insertando facturas...")
facturas_data = [
    # Pendientes (por cobrar próximas semanas)
    {"cliente_id": cliente_ids[0], "numero": "FV-2026-001", "fecha_emision": str(HOY - timedelta(days=20)),
     "fecha_vencimiento": str(HOY + timedelta(days=8)),  "valor": 12500000, "estado": "pendiente"},
    {"cliente_id": cliente_ids[1], "numero": "FV-2026-002", "fecha_emision": str(HOY - timedelta(days=10)),
     "fecha_vencimiento": str(HOY + timedelta(days=18)), "valor": 8700000,  "estado": "pendiente"},
    {"cliente_id": cliente_ids[2], "numero": "FV-2026-003", "fecha_emision": str(HOY - timedelta(days=5)),
     "fecha_vencimiento": str(HOY + timedelta(days=30)), "valor": 6200000,  "estado": "pendiente"},
    # Vencida
    {"cliente_id": cliente_ids[0], "numero": "FV-2026-004", "fecha_emision": str(HOY - timedelta(days=45)),
     "fecha_vencimiento": str(HOY - timedelta(days=5)),  "valor": 4800000,  "estado": "vencida"},
]
res = supabase.table("facturas").insert(facturas_data).execute()
factura_ids = [r["id"] for r in res.data]

# --- Categorías de egreso ---
print("Insertando categorías de egreso...")
categorias_data = [
    {"nombre": "Nómina",              "tipo": "socios"},
    {"nombre": "Proveedores",         "tipo": "terceros"},
    {"nombre": "Arriendo oficina",    "tipo": "terceros"},
    {"nombre": "Crédito bancario",    "tipo": "financieros"},
    {"nombre": "Servicios públicos",  "tipo": "terceros"},
]
res = supabase.table("categorias_egreso").insert(categorias_data).execute()
cat_ids = [r["id"] for r in res.data]

# --- Saldos semanales (cuenta operativa) ---
print("Insertando saldos semanales...")
# Saldo inicial semana -1, luego va variando
saldos_base = [18000000, 15200000, 22400000, 19800000, 14600000,
               11200000, 17500000, 13900000, 20100000, 16300000]
saldos_data = []
for i, ((anio, num), sid) in enumerate(semana_lista):
    saldos_data.append({"semana_id": sid, "cuenta_id": cuenta_ids[0], "saldo": saldos_base[i]})
    saldos_data.append({"semana_id": sid, "cuenta_id": cuenta_ids[1], "saldo": 5000000})
supabase.table("saldos_semanales").insert(saldos_data).execute()

# --- Recaudos (semanas 1-3 futuras) ---
print("Insertando recaudos...")
recaudos_data = [
    {"semana_id": semana_lista[2][1], "factura_id": factura_ids[0],
     "valor": 12500000, "fecha": str(lunes(HOY) + timedelta(weeks=1, days=2))},
    {"semana_id": semana_lista[3][1], "factura_id": factura_ids[1],
     "valor": 8700000,  "fecha": str(lunes(HOY) + timedelta(weeks=2, days=1))},
    {"semana_id": semana_lista[5][1], "factura_id": factura_ids[2],
     "valor": 6200000,  "fecha": str(lunes(HOY) + timedelta(weeks=4, days=3))},
]
supabase.table("recaudos").insert(recaudos_data).execute()

# --- Egresos (semanas 1-8) ---
print("Insertando egresos...")
egresos_data = []
egreso_montos = [9500000, 3200000, 2800000, 4100000, 800000]
for i, ((anio, num), sid) in enumerate(semana_lista[1:8], 1):
    for j, cat_id in enumerate(cat_ids):
        egresos_data.append({
            "semana_id": sid,
            "categoria_id": cat_id,
            "valor": egreso_montos[j],
            "descripcion": None
        })
supabase.table("egresos").insert(egresos_data).execute()

# --- Compromisos especiales ---
print("Insertando compromisos...")
compromisos_data = [
    {"tercero": "Leasing Bancolombia", "descripcion": "Cuota vehículo operativo",
     "fecha": str(HOY + timedelta(days=5)),  "valor": 3800000, "prioridad": "alta",  "estado": "pendiente"},
    {"tercero": "DIAN",                "descripcion": "Retención en la fuente Q2",
     "fecha": str(HOY + timedelta(days=12)), "valor": 2100000, "prioridad": "alta",  "estado": "pendiente"},
    {"tercero": "Fondo de empleados",  "descripcion": "Descuentos nómina junio",
     "fecha": str(HOY + timedelta(days=20)), "valor": 950000,  "prioridad": "media", "estado": "pendiente"},
    {"tercero": "Arrendador local",    "descripcion": "Arriendo julio anticipado",
     "fecha": str(HOY + timedelta(days=35)), "valor": 2800000, "prioridad": "media", "estado": "pendiente"},
]
supabase.table("compromisos").insert(compromisos_data).execute()

print("\n✅ Seed completado:")
print(f"  {len(semanas_def)} semanas | {len(cuentas_data)} cuentas | {len(clientes_data)} clientes")
print(f"  {len(facturas_data)} facturas | {len(categorias_data)} categorías | {len(egresos_data)} egresos")
print(f"  {len(recaudos_data)} recaudos | {len(compromisos_data)} compromisos")
