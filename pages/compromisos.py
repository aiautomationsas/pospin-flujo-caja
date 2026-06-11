"""Compromisos especiales — CRUD de obligaciones con terceros."""
import streamlit as st
from datetime import date
from core.auth import check_role
from core.database import get_client
from utils.format import fmt_money


def render():
    st.title("📋 Compromisos Especiales")

    client = get_client()
    can_edit = check_role(["admin", "editor"])

    # ── Filters ──
    col1, col2 = st.columns(2)
    with col1:
        filter_estado = st.selectbox(
            "Estado",
            ["Todos", "pendiente", "pagado", "vencido"],
            key="filter_estado",
        )
    with col2:
        filter_prioridad = st.selectbox(
            "Prioridad",
            ["Todas", "alta", "media", "baja"],
            key="filter_prioridad",
        )

    # ── Add form (editors/admins only) ──
    if can_edit:
        with st.expander("➕ Nuevo Compromiso"):
            with st.form("form_compromiso", clear_on_submit=True):
                col1, col2 = st.columns(2)
                with col1:
                    tercero = st.text_input("Tercero", key="comp_tercero")
                    descripcion = st.text_input("Descripción", key="comp_desc")
                    fecha_comp = st.date_input("Fecha", value=date.today(), key="comp_fecha")
                with col2:
                    valor = st.number_input(
                        "Valor", min_value=0.0, step=1000000.0, format="%.0f", key="comp_valor"
                    )
                    prioridad = st.selectbox("Prioridad", ["alta", "media", "baja"], key="comp_prioridad")

                if st.form_submit_button("💾 Guardar"):
                    if not tercero:
                        st.warning("El tercero es obligatorio.")
                    else:
                        try:
                            client.table("compromisos").insert({
                                "tercero": tercero,
                                "descripcion": descripcion or None,
                                "fecha": fecha_comp.isoformat(),
                                "valor": valor,
                                "prioridad": prioridad,
                                "estado": "pendiente",
                            }).execute()
                            st.success("✅ Compromiso creado.")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {e}")

    # ── List compromisos ──
    st.markdown("---")

    # Build query
    query = client.table("compromisos").select("*")
    if filter_estado != "Todos":
        query = query.eq("estado", filter_estado)
    if filter_prioridad != "Todas":
        query = query.eq("prioridad", filter_prioridad)

    compromisos_resp = query.order("fecha").execute()

    if not compromisos_resp.data:
        st.info("No hay compromisos que coincidan con los filtros.")
        st.stop()

    # Priority color badges
    prioridad_colors = {"alta": "🔴", "media": "🟡", "baja": "🟢"}
    estado_labels = {"pendiente": "⏳", "pagado": "✅", "vencido": "❌"}

    for comp in compromisos_resp.data:
        prioridad_badge = prioridad_colors.get(comp["prioridad"], "⚪")
        estado_badge = estado_labels.get(comp["estado"], "❓")

        header = f"{prioridad_badge} **{comp['tercero']}** — {comp['fecha']} — {fmt_money(comp['valor'])} [{comp['estado']}] {estado_badge}"

        if can_edit:
            with st.expander(header):
                st.text(f"Descripción: {comp.get('descripcion') or 'Sin descripción'}")

                col1, col2, col3 = st.columns(3)
                with col1:
                    # Edit state
                    new_estado = st.selectbox(
                        "Estado",
                        ["pendiente", "pagado", "vencido"],
                        index=["pendiente", "pagado", "vencido"].index(comp["estado"]),
                        key=f"edit_estado_{comp['id']}",
                    )
                with col2:
                    new_prioridad = st.selectbox(
                        "Prioridad",
                        ["alta", "media", "baja"],
                        index=["alta", "media", "baja"].index(comp["prioridad"]),
                        key=f"edit_prioridad_{comp['id']}",
                    )
                with col3:
                    st.text("")  # spacer
                    if st.button("💾 Actualizar", key=f"save_comp_{comp['id']}"):
                        try:
                            client.table("compromisos").update({
                                "estado": new_estado,
                                "prioridad": new_prioridad,
                            }).eq("id", comp["id"]).execute()
                            st.success("✅ Actualizado.")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {e}")

                # Delete
                if st.button(f"🗑️ Eliminar", key=f"del_comp_{comp['id']}"):
                    st.session_state[f"confirm_del_{comp['id']}"] = True

                if st.session_state.get(f"confirm_del_{comp['id']}"):
                    st.warning("¿Estás seguro de eliminar este compromiso?")
                    c1, c2 = st.columns(2)
                    with c1:
                        if st.button("Sí, eliminar", key=f"confirm_yes_{comp['id']}"):
                            try:
                                client.table("compromisos").delete().eq("id", comp["id"]).execute()
                                st.session_state.pop(f"confirm_del_{comp['id']}", None)
                                st.success("🗑️ Eliminado.")
                                st.rerun()
                            except Exception as e:
                                st.error(f"Error: {e}")
                    with c2:
                        if st.button("Cancelar", key=f"confirm_no_{comp['id']}"):
                            st.session_state.pop(f"confirm_del_{comp['id']}", None)
                            st.rerun()
        else:
            # Viewer: just show info
            st.markdown(header)
            if comp.get("descripcion"):
                st.caption(comp["descripcion"])


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Compromisos - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
