"""Actualización semanal de datos — saldos, recaudos, egresos."""
import streamlit as st
from datetime import date, timedelta
from core.auth import check_role
from core.database import get_client
from utils.format import fmt_money


def render():
    st.title("📝 Actualización Semanal")

    if not check_role(["admin", "editor"]):
        st.warning("🔒 Solo lectura — necesitas rol de editor o administrador para actualizar datos.")
        st.stop()

    client = get_client()

    # ── Step 1: Select week ──
    st.subheader("1. Selecciona la semana")

    semanas_resp = client.table("semanas").select("*").order("fecha_inicio", desc=True).limit(52).execute()
    if not semanas_resp.data:
        st.info("No hay semanas registradas. Importa datos primero.")
        st.stop()

    # Default to current week
    today = date.today()
    iso = today.isocalendar()
    current_semana_num = iso[1]
    current_anio = iso[0]

    semana_options = {}
    default_idx = 0
    for i, s in enumerate(semanas_resp.data):
        label = f"Semana {s['numero']} ({s['fecha_inicio']} - {s['fecha_fin']})"
        semana_options[label] = s
        if s["numero"] == current_semana_num and s["anio"] == current_anio:
            default_idx = i

    selected_label = st.selectbox(
        "Semana",
        list(semana_options.keys()),
        index=min(default_idx, len(semana_options) - 1),
    )
    selected_semana = semana_options[selected_label]
    semana_id = selected_semana["id"]

    # ── Step 2: Tabs ──
    st.subheader("2. Ingresa los datos")
    tab_saldos, tab_recaudos, tab_egresos = st.tabs([
        "Saldos Bancarios", "Recaudos", "Egresos"
    ])

    with tab_saldos:
        _render_saldos(client, semana_id, selected_semana)

    with tab_recaudos:
        _render_recaudos(client, semana_id, selected_semana)

    with tab_egresos:
        _render_egresos(client, semana_id, selected_semana)


def _render_saldos(client, semana_id, semana):
    """Tab: Saldos Bancarios."""
    cuentas_resp = client.table("cuentas").select("*").eq("activa", True).order("nombre").execute()
    if not cuentas_resp.data:
        st.info("No hay cuentas bancarias activas. Configúralas en ⚙️ Configuración.")
        return

    st.markdown(f"**Semana {semana['numero']}** — Ingresa el saldo actual de cada cuenta.")

    with st.form("form_saldos"):
        saldos = {}
        for cuenta in cuentas_resp.data:
            # Get existing saldo if any
            existing = client.table("saldos_semanales").select("saldo").eq(
                "semana_id", semana_id
            ).eq("cuenta_id", cuenta["id"]).execute()
            default_val = float(existing.data[0]["saldo"]) if existing.data else 0.0

            saldos[cuenta["id"]] = st.number_input(
                f"{cuenta['nombre']} ({cuenta['banco']} - {cuenta['numero']})",
                min_value=-1e15,
                value=default_val,
                step=1000000.0,
                format="%.0f",
                key=f"saldo_{cuenta['id']}",
            )

        if st.form_submit_button("💾 Guardar Saldos"):
            try:
                for cuenta_id, saldo in saldos.items():
                    # Upsert: check if exists
                    existing = client.table("saldos_semanales").select("id").eq(
                        "semana_id", semana_id
                    ).eq("cuenta_id", cuenta_id).execute()
                    if existing.data:
                        client.table("saldos_semanales").update(
                            {"saldo": saldo}
                        ).eq("id", existing.data[0]["id"]).execute()
                    else:
                        client.table("saldos_semanales").insert({
                            "semana_id": semana_id,
                            "cuenta_id": cuenta_id,
                            "saldo": saldo,
                        }).execute()
                st.success("✅ Saldos guardados correctamente.")
                st.info("📊 Proyección actualizada. Ve al Dashboard para ver los cambios.")
            except Exception as e:
                st.error(f"Error al guardar: {e}")


def _actualizar_estado_factura(client, factura_id: int) -> None:
    """Recalcula y persiste el estado de una factura según sus recaudos acumulados."""
    factura_resp = client.table("facturas").select("valor").eq("id", factura_id).execute()
    if not factura_resp.data:
        return
    valor_total = float(factura_resp.data[0]["valor"])

    recaudos_resp = client.table("recaudos").select("valor").eq("factura_id", factura_id).execute()
    total_recaudado = sum(float(r["valor"]) for r in (recaudos_resp.data or []))

    if total_recaudado <= 0:
        nuevo_estado = "pendiente"
    elif total_recaudado >= valor_total:
        nuevo_estado = "pagada"
    else:
        nuevo_estado = "parcial"

    client.table("facturas").update({"estado": nuevo_estado}).eq("id", factura_id).execute()


def _render_recaudos(client, semana_id, semana):
    """Tab: Recaudos."""
    # Get pending/partial invoices for new recaudo form
    facturas_resp = client.table("facturas").select(
        "id,numero,valor,cliente_id,clientes(nombre)",
    ).in_("estado", ["pendiente", "parcial"]).execute()

    # ── Recaudos existentes de esta semana ──
    st.markdown(f"**Semana {semana['numero']}** — Recaudos registrados")

    recaudos_semana_resp = client.table("recaudos").select(
        "id,valor,fecha,factura_id,facturas(numero,valor,clientes(nombre))"
    ).eq("semana_id", semana_id).order("fecha").execute()

    recaudos_existentes = recaudos_semana_resp.data or []

    if recaudos_existentes:
        cols_hdr = st.columns([2, 1, 2, 2, 1])
        for col, hdr in zip(cols_hdr, ["Cliente", "Factura", "Fecha", "Valor", ""]):
            col.markdown(f"**{hdr}**")

        for rec in recaudos_existentes:
            factura_data = rec.get("facturas") or {}
            cliente_data = (factura_data.get("clientes") or {})
            cliente_nombre = cliente_data.get("nombre", "—") if isinstance(cliente_data, dict) else "—"
            factura_numero = factura_data.get("numero", "—") if isinstance(factura_data, dict) else "—"

            cols = st.columns([2, 1, 2, 2, 1])
            cols[0].text(cliente_nombre)
            cols[1].text(factura_numero)
            cols[2].text(str(rec["fecha"]))
            cols[3].text(fmt_money(rec["valor"]))
            with cols[4]:
                if st.button("🗑️", key=f"del_recaudo_{rec['id']}", help="Eliminar recaudo"):
                    try:
                        factura_id_afectada = rec["factura_id"]
                        client.table("recaudos").delete().eq("id", rec["id"]).execute()
                        _actualizar_estado_factura(client, factura_id_afectada)
                        st.success("Recaudo eliminado y estado de factura actualizado.")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Error al eliminar: {exc}")
    else:
        st.info("No hay recaudos registrados para esta semana.")

    st.markdown("---")

    # ── Nuevo recaudo ──
    st.markdown("**Registrar nuevo recaudo**")

    if not facturas_resp.data:
        st.info("No hay facturas pendientes de recaudo.")
        return

    # Build factura options
    factura_options = {}
    for f in facturas_resp.data:
        cliente_info = f.get("clientes", {})
        if isinstance(cliente_info, dict):
            cliente_nombre = cliente_info.get("nombre", "Desconocido")
        else:
            cliente_nombre = "Desconocido"
        label = f"{cliente_nombre} - Factura {f['numero']} - {fmt_money(f['valor'])}"
        factura_options[label] = f

    with st.form("form_recaudos"):
        selected_factura_label = st.selectbox(
            "Factura",
            list(factura_options.keys()),
            key="factura_select",
        )
        selected_factura = factura_options[selected_factura_label]

        valor_recaudo = st.number_input(
            "Valor recaudado",
            min_value=0.0,
            value=0.0,
            step=1000000.0,
            format="%.0f",
            key="recaudo_valor",
        )
        fecha_recaudo = st.date_input(
            "Fecha del recaudo",
            value=date.today(),
            key="recaudo_fecha",
        )

        if st.form_submit_button("💾 Guardar Recaudo"):
            if valor_recaudo <= 0:
                st.warning("El valor debe ser mayor a 0.")
            else:
                try:
                    client.table("recaudos").insert({
                        "semana_id": semana_id,
                        "factura_id": selected_factura["id"],
                        "valor": valor_recaudo,
                        "fecha": fecha_recaudo.isoformat(),
                    }).execute()
                    # Recalcular estado de la factura automáticamente
                    _actualizar_estado_factura(client, selected_factura["id"])
                    st.success("✅ Recaudo registrado y estado de factura actualizado.")
                    st.info("📊 Ve al Dashboard para ver los cambios.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error al guardar: {e}")


def _render_egresos(client, semana_id, semana):
    """Tab: Egresos."""
    categorias_resp = client.table("categorias_egreso").select("*").eq("activa", True).order("nombre").execute()
    if not categorias_resp.data:
        st.info("No hay categorías de egreso activas. Configúralas en ⚙️ Configuración.")
        return

    st.markdown(f"**Semana {semana['numero']}** — Ingresa los egresos por categoría.")

    with st.form("form_egresos"):
        egresos = {}
        for cat in categorias_resp.data:
            # Get existing egreso if any
            existing = client.table("egresos").select("valor,descripcion").eq(
                "semana_id", semana_id
            ).eq("categoria_id", cat["id"]).execute()
            default_val = float(existing.data[0]["valor"]) if existing.data else 0.0
            default_desc = existing.data[0].get("descripcion", "") if existing.data else ""

            col1, col2 = st.columns([2, 1])
            with col1:
                egresos[cat["id"]] = {
                    "valor": st.number_input(
                        f"{cat['nombre']} ({cat['tipo']})",
                        min_value=0.0,
                        value=default_val,
                        step=1000000.0,
                        format="%.0f",
                        key=f"egreso_val_{cat['id']}",
                    ),
                    "descripcion": st.text_input(
                        "Descripción",
                        value=default_desc,
                        key=f"egreso_desc_{cat['id']}",
                    ),
                }

        if st.form_submit_button("💾 Guardar Egresos"):
            try:
                for categoria_id, data in egresos.items():
                    if data["valor"] <= 0:
                        continue
                    existing = client.table("egresos").select("id").eq(
                        "semana_id", semana_id
                    ).eq("categoria_id", categoria_id).execute()
                    record = {
                        "valor": data["valor"],
                        "descripcion": data["descripcion"] or None,
                    }
                    if existing.data:
                        client.table("egresos").update(record).eq(
                            "id", existing.data[0]["id"]
                        ).execute()
                    else:
                        record["semana_id"] = semana_id
                        record["categoria_id"] = categoria_id
                        client.table("egresos").insert(record).execute()
                st.success("✅ Egresos guardados correctamente.")
                st.info("📊 Proyección actualizada. Ve al Dashboard para ver los cambios.")
            except Exception as e:
                st.error(f"Error al guardar: {e}")


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Actualizar - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
