"""Configuración — administración de cuentas, clientes, categorías, usuarios."""
import streamlit as st
from core.auth import check_role, get_current_user
from core.database import get_client, get_service_client


def render():
    st.title("⚙️ Configuración")

    if not check_role(["admin"]):
        st.error("🔒 Acceso restringido — solo administradores pueden acceder a esta página.")
        st.stop()

    client = get_client()

    tab_cuentas, tab_clientes, tab_categorias, tab_recurrentes, tab_usuarios = st.tabs([
        "Cuentas Bancarias", "Clientes", "Categorías de Egreso", "Egresos Recurrentes", "Usuarios"
    ])

    with tab_cuentas:
        _render_cuentas(client)

    with tab_clientes:
        _render_clientes(client)

    with tab_categorias:
        _render_categorias(client)

    with tab_recurrentes:
        _render_recurrentes(client)

    with tab_usuarios:
        _render_usuarios()


def _render_cuentas(client):
    """CRUD for cuentas bancarias."""
    st.subheader("Cuentas Bancarias")

    with st.form("form_cuenta", clear_on_submit=True):
        col1, col2, col3 = st.columns(3)
        with col1:
            nombre = st.text_input("Nombre", key="cuenta_nombre")
        with col2:
            banco = st.text_input("Banco", key="cuenta_banco")
        with col3:
            numero = st.text_input("Número", key="cuenta_numero")

        if st.form_submit_button("➕ Agregar Cuenta"):
            if not nombre or not banco or not numero:
                st.warning("Todos los campos son obligatorios.")
            else:
                try:
                    client.table("cuentas").insert({
                        "nombre": nombre, "banco": banco, "numero": numero
                    }).execute()
                    st.success(f"Cuenta '{nombre}' creada.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    # List
    cuentas = client.table("cuentas").select("*").order("nombre").execute()
    if cuentas.data:
        for c in cuentas.data:
            col1, col2, col3, col4 = st.columns([3, 2, 2, 1])
            with col1:
                st.text(c["nombre"])
            with col2:
                st.text(c["banco"])
            with col3:
                st.text(c["numero"])
            with col4:
                new_state = not c["activa"]
                label = "✅" if c["activa"] else "❌"
                if st.button(label, key=f"toggle_cuenta_{c['id']}"):
                    client.table("cuentas").update({"activa": new_state}).eq("id", c["id"]).execute()
                    st.rerun()


def _render_clientes(client):
    """CRUD for clientes."""
    st.subheader("Clientes")

    with st.form("form_cliente", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            nombre = st.text_input("Nombre", key="cliente_nombre")
        with col2:
            contacto = st.text_input("Contacto", key="cliente_contacto")

        if st.form_submit_button("➕ Agregar Cliente"):
            if not nombre:
                st.warning("El nombre es obligatorio.")
            else:
                try:
                    client.table("clientes").insert({
                        "nombre": nombre, "contacto": contacto or None
                    }).execute()
                    st.success(f"Cliente '{nombre}' creado.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    # List
    clientes = client.table("clientes").select("*").order("nombre").execute()
    if clientes.data:
        for c in clientes.data:
            col1, col2, col3 = st.columns([3, 3, 1])
            with col1:
                st.text(c["nombre"])
            with col2:
                st.text(c.get("contacto") or "")
            with col3:
                new_state = not c["activo"]
                label = "✅" if c["activo"] else "❌"
                if st.button(label, key=f"toggle_cliente_{c['id']}"):
                    client.table("clientes").update({"activo": new_state}).eq("id", c["id"]).execute()
                    st.rerun()


def _render_categorias(client):
    """CRUD for categorías de egreso."""
    st.subheader("Categorías de Egreso")

    with st.form("form_categoria", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            nombre = st.text_input("Nombre", key="cat_nombre")
        with col2:
            tipo = st.selectbox("Tipo", ["terceros", "socios", "financieros"], key="cat_tipo")

        if st.form_submit_button("➕ Agregar Categoría"):
            if not nombre:
                st.warning("El nombre es obligatorio.")
            else:
                try:
                    client.table("categorias_egreso").insert({
                        "nombre": nombre, "tipo": tipo
                    }).execute()
                    st.success(f"Categoría '{nombre}' creada.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    # List
    categorias = client.table("categorias_egreso").select("*").order("nombre").execute()
    if categorias.data:
        for c in categorias.data:
            col1, col2, col3 = st.columns([3, 2, 1])
            with col1:
                st.text(c["nombre"])
            with col2:
                st.text(c["tipo"])
            with col3:
                new_state = not c["activa"]
                label = "✅" if c["activa"] else "❌"
                if st.button(label, key=f"toggle_cat_{c['id']}"):
                    client.table("categorias_egreso").update({"activa": new_state}).eq("id", c["id"]).execute()
                    st.rerun()


def _render_usuarios():
    """List users and change roles."""
    st.subheader("Usuarios")

    svc_client = get_service_client()
    current_user = get_current_user()

    users_resp = svc_client.table("user_profiles").select("*").order("email").execute()
    if not users_resp.data:
        st.info("No hay usuarios registrados.")
        return

    for u in users_resp.data:
        col1, col2, col3 = st.columns([3, 3, 2])
        with col1:
            st.text(u["email"])
        with col2:
            st.text(u.get("full_name") or "")
        with col3:
            # Cannot change own role
            if u["id"] == current_user["id"]:
                st.text(f"👤 {u['role']} (tú)")
            else:
                new_role = st.selectbox(
                    "Rol",
                    ["admin", "editor", "viewer"],
                    index=["admin", "editor", "viewer"].index(u["role"]) if u["role"] in ["admin", "editor", "viewer"] else 2,
                    key=f"role_{u['id']}",
                    label_visibility="collapsed",
                )
                if new_role != u["role"]:
                    if st.button("Cambiar", key=f"change_role_{u['id']}"):
                        try:
                            svc_client.table("user_profiles").update(
                                {"role": new_role}
                            ).eq("id", u["id"]).execute()
                            st.success(f"Rol de {u['email']} cambiado a {new_role}.")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {e}")



def _render_recurrentes(client):
    """CRUD for egresos recurrentes."""
    st.subheader("Egresos Recurrentes / Plantillas")
    
    # Categorías de egreso activas
    categorias_resp = client.table("categorias_egreso").select("id, nombre").eq("activa", True).execute()
    categorias_list = categorias_resp.data or []
    cat_names = [c["nombre"] for c in categorias_list]
    
    if not cat_names:
        st.warning("Debes registrar al menos una Categoría de Egreso activa antes de configurar egresos recurrentes.")
        return

    with st.form("form_recurrente", clear_on_submit=True):
        col1, col2, col3 = st.columns(3)
        with col1:
            categoria_name = st.selectbox("Categoría", cat_names)
            categoria_id = next(c["id"] for c in categorias_list if c["nombre"] == categoria_name)
        with col2:
            tercero = st.text_input("Tercero / Proveedor", placeholder="EPM, Nómina, etc.")
        with col3:
            frecuencia = st.selectbox("Frecuencia", ["semanal", "quincenal", "mensual", "semestral", "anual"])

        col4, col5 = st.columns(2)
        with col4:
            dia_pago = st.number_input("Día de Pago", min_value=1, max_value=1231, value=15, 
                                       help="Mensual: día del mes (1-31). Semanal: día (1-7, L-D). Anual/Semestral: Mes y día codificado (ej. 1215 para 15 de diciembre). Quincenal: Ignorado (vence 15 y 30).")
        with col5:
            monto = st.number_input("Monto Estimado (COP)", min_value=0.0, step=50000.0)

        if st.form_submit_button("➕ Agregar Egreso Recurrente"):
            if not tercero or monto <= 0:
                st.warning("El tercero y el monto estimado son obligatorios.")
            else:
                try:
                    client.table("egresos_recurrentes").insert({
                        "categoria_id": categoria_id,
                        "tercero": tercero,
                        "frecuencia": frecuencia,
                        "dia_pago": int(dia_pago),
                        "monto_estimado": monto
                    }).execute()
                    st.success(f"Plantilla para '{tercero}' creada.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    # List
    recurrentes_resp = client.table("egresos_recurrentes").select(
        "*, categorias_egreso(nombre)"
    ).order("tercero").execute()
    
    if recurrentes_resp.data:
        for r in recurrentes_resp.data:
            cat_info = r.get("categorias_egreso", {})
            cat_name = cat_info.get("nombre", "N/A") if isinstance(cat_info, dict) else "N/A"
            
            col1, col2, col3, col4, col5 = st.columns([3, 2, 2, 2, 1])
            with col1:
                st.text(f"{r['tercero']} ({cat_name})")
            with col2:
                st.text(r["frecuencia"].capitalize())
            with col3:
                st.text(f"Día: {r['dia_pago']}")
            with col4:
                from utils.format import fmt_money
                st.text(fmt_money(float(r["monto_estimado"])))
            with col5:
                new_state = not r["activa"]
                label = "✅" if r["activa"] else "❌"
                if st.button(label, key=f"toggle_recurrente_{r['id']}"):
                    client.table("egresos_recurrentes").update({"activa": new_state}).eq("id", r["id"]).execute()
                    st.rerun()


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Configuración - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()