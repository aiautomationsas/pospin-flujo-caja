"""Gestión de Facturas — CRUD completo."""
import streamlit as st
from datetime import date
from core.auth import check_role
from core.database import get_client
from utils.format import fmt_money

_ESTADOS = ["pendiente", "parcial", "pagada", "vencida"]
_ESTADO_LABELS = {
    "pendiente": "🟡 Pendiente",
    "parcial": "🔵 Parcial",
    "pagada": "🟢 Pagada",
    "vencida": "🔴 Vencida",
}


def render() -> None:
    st.title("🧾 Facturas")

    client = get_client()
    can_edit = check_role(["admin", "editor"])

    # ── Pestañas ──
    tab_lista, tab_nueva, tab_editar = st.tabs(["Lista", "Nueva Factura", "Editar / Eliminar"])

    with tab_lista:
        _render_lista(client)

    with tab_nueva:
        if can_edit:
            _render_nueva(client)
        else:
            st.warning("🔒 Solo editores y administradores pueden crear facturas.")

    with tab_editar:
        if can_edit:
            _render_editar(client)
        else:
            st.warning("🔒 Solo editores y administradores pueden modificar facturas.")


# ─────────────────────────────────────────────────────────────────────────────
def _render_lista(client) -> None:
    """Tabla de facturas con filtros de estado."""
    st.subheader("Listado de Facturas")

    filtro_estado = st.multiselect(
        "Filtrar por estado",
        _ESTADOS,
        default=["pendiente", "parcial", "vencida"],
        format_func=lambda s: _ESTADO_LABELS[s],
    )

    query = (
        client.table("facturas")
        .select("id,numero,valor,estado,fecha_emision,fecha_vencimiento,cliente_id,clientes(nombre)")
        .order("fecha_vencimiento")
    )
    if filtro_estado:
        query = query.in_("estado", filtro_estado)

    resp = query.execute()
    facturas = resp.data or []

    if not facturas:
        st.info("No hay facturas con los filtros seleccionados.")
        return

    # Encabezado
    cols = st.columns([2, 1, 2, 2, 2, 2])
    for col, header in zip(
        cols,
        ["Cliente", "Nro.", "Emisión", "Vencimiento", "Valor", "Estado"],
    ):
        col.markdown(f"**{header}**")

    st.divider()

    for f in facturas:
        cliente_nombre = (f.get("clientes") or {}).get("nombre", "—")
        cols = st.columns([2, 1, 2, 2, 2, 2])
        cols[0].text(cliente_nombre)
        cols[1].text(f["numero"])
        cols[2].text(str(f["fecha_emision"]))
        cols[3].text(str(f["fecha_vencimiento"]))
        cols[4].text(fmt_money(f["valor"]))
        cols[5].markdown(_ESTADO_LABELS.get(f["estado"], f["estado"]))


# ─────────────────────────────────────────────────────────────────────────────
def _render_nueva(client) -> None:
    """Formulario para crear una nueva factura."""
    st.subheader("Crear Factura")

    clientes_resp = client.table("clientes").select("id,nombre").eq("activo", True).order("nombre").execute()
    clientes = clientes_resp.data or []

    if not clientes:
        st.warning("No hay clientes activos. Crea uno primero en ⚙️ Configuración.")
        return

    cliente_opts = {c["nombre"]: c["id"] for c in clientes}

    with st.form("form_nueva_factura", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            cliente_nombre = st.selectbox("Cliente", list(cliente_opts.keys()))
            numero = st.text_input("Número de factura", placeholder="FC-001")
        with col2:
            fecha_emision = st.date_input("Fecha de emisión", value=date.today())
            fecha_vencimiento = st.date_input("Fecha de vencimiento", value=date.today())

        valor = st.number_input(
            "Valor",
            min_value=0.0,
            value=0.0,
            step=1_000_000.0,
            format="%.0f",
        )
        estado = st.selectbox(
            "Estado inicial",
            _ESTADOS,
            format_func=lambda s: _ESTADO_LABELS[s],
        )

        submitted = st.form_submit_button("💾 Crear Factura")

    if submitted:
        if not numero.strip():
            st.warning("El número de factura es obligatorio.")
            return
        if valor <= 0:
            st.warning("El valor debe ser mayor a 0.")
            return
        if fecha_vencimiento < fecha_emision:
            st.warning("La fecha de vencimiento no puede ser anterior a la de emisión.")
            return

        try:
            client.table("facturas").insert(
                {
                    "cliente_id": cliente_opts[cliente_nombre],
                    "numero": numero.strip(),
                    "fecha_emision": fecha_emision.isoformat(),
                    "fecha_vencimiento": fecha_vencimiento.isoformat(),
                    "valor": valor,
                    "estado": estado,
                }
            ).execute()
            st.success(f"✅ Factura {numero} creada correctamente.")
            st.rerun()
        except Exception as exc:
            st.error(f"Error al crear factura: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
def _render_editar(client) -> None:
    """Selección + edición / eliminación de una factura existente."""
    st.subheader("Editar o Eliminar Factura")

    resp = client.table("facturas").select(
        "id,numero,valor,estado,fecha_emision,fecha_vencimiento,cliente_id,clientes(nombre)"
    ).order("fecha_vencimiento").execute()
    facturas = resp.data or []

    if not facturas:
        st.info("No hay facturas registradas.")
        return

    # Selector
    factura_opts: dict[str, dict] = {}
    for f in facturas:
        cliente_nombre = (f.get("clientes") or {}).get("nombre", "—")
        label = f"{cliente_nombre} · Nro. {f['numero']} · {fmt_money(f['valor'])} · {_ESTADO_LABELS.get(f['estado'], f['estado'])}"
        factura_opts[label] = f

    selected_label = st.selectbox("Selecciona la factura", list(factura_opts.keys()))
    factura = factura_opts[selected_label]

    clientes_resp = client.table("clientes").select("id,nombre").eq("activo", True).order("nombre").execute()
    clientes = clientes_resp.data or []
    cliente_opts = {c["nombre"]: c["id"] for c in clientes}
    cliente_names = list(cliente_opts.keys())

    # Buscar cliente actual (puede estar inactivo)
    cliente_actual_resp = client.table("clientes").select("nombre").eq("id", factura["cliente_id"]).execute()
    cliente_actual_nombre = (cliente_actual_resp.data or [{}])[0].get("nombre", "")
    if cliente_actual_nombre not in cliente_opts:
        # Si el cliente está inactivo, incluirlo temporalmente
        cliente_opts[cliente_actual_nombre] = factura["cliente_id"]
        cliente_names = [cliente_actual_nombre] + cliente_names

    default_cliente_idx = cliente_names.index(cliente_actual_nombre) if cliente_actual_nombre in cliente_names else 0

    st.markdown("---")

    with st.form("form_editar_factura"):
        col1, col2 = st.columns(2)
        with col1:
            cliente_sel = st.selectbox("Cliente", cliente_names, index=default_cliente_idx)
            numero = st.text_input("Número de factura", value=factura["numero"])
        with col2:
            fecha_emision = st.date_input(
                "Fecha de emisión",
                value=date.fromisoformat(str(factura["fecha_emision"])),
            )
            fecha_vencimiento = st.date_input(
                "Fecha de vencimiento",
                value=date.fromisoformat(str(factura["fecha_vencimiento"])),
            )

        valor = st.number_input(
            "Valor",
            min_value=0.0,
            value=float(factura["valor"]),
            step=1_000_000.0,
            format="%.0f",
        )
        estado_idx = _ESTADOS.index(factura["estado"]) if factura["estado"] in _ESTADOS else 0
        estado = st.selectbox(
            "Estado",
            _ESTADOS,
            index=estado_idx,
            format_func=lambda s: _ESTADO_LABELS[s],
        )

        col_save, col_del = st.columns(2)
        with col_save:
            save = st.form_submit_button("💾 Guardar Cambios")
        with col_del:
            delete = st.form_submit_button("🗑️ Eliminar Factura", type="secondary")

    if save:
        if not numero.strip():
            st.warning("El número de factura es obligatorio.")
            return
        if valor <= 0:
            st.warning("El valor debe ser mayor a 0.")
            return
        if fecha_vencimiento < fecha_emision:
            st.warning("La fecha de vencimiento no puede ser anterior a la de emisión.")
            return
        try:
            client.table("facturas").update(
                {
                    "cliente_id": cliente_opts[cliente_sel],
                    "numero": numero.strip(),
                    "fecha_emision": fecha_emision.isoformat(),
                    "fecha_vencimiento": fecha_vencimiento.isoformat(),
                    "valor": valor,
                    "estado": estado,
                }
            ).eq("id", factura["id"]).execute()
            st.success("✅ Factura actualizada correctamente.")
            st.rerun()
        except Exception as exc:
            st.error(f"Error al actualizar: {exc}")

    if delete:
        # Verificar que no tenga recaudos antes de eliminar
        recaudos_resp = client.table("recaudos").select("id").eq("factura_id", factura["id"]).execute()
        if recaudos_resp.data:
            st.error(
                f"No se puede eliminar: la factura tiene {len(recaudos_resp.data)} recaudo(s) registrado(s). "
                "Elimina los recaudos primero."
            )
            return
        try:
            client.table("facturas").delete().eq("id", factura["id"]).execute()
            st.success(f"🗑️ Factura {factura['numero']} eliminada.")
            st.rerun()
        except Exception as exc:
            st.error(f"Error al eliminar: {exc}")


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Facturas - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
