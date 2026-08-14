"""Módulo de Gestión de Obligaciones y Cuentas por Pagar (SSOT)."""
import streamlit as st
from datetime import date, datetime, timedelta
from typing import Optional
from core.auth import check_role
from core.database import get_client
from core.models import Obligacion
from utils.format import fmt_money, fmt_date


def calculate_payment_remaining(
    monto_total: float, monto_pagado: float, current_saldo: float
) -> tuple[float, str]:
    """Calcula el nuevo saldo pendiente y el estado actualizado tras un pago."""
    nuevo_saldo = max(0.0, float(current_saldo) - float(monto_pagado))
    estado = "pagada" if nuevo_saldo <= 0 else "parcial"
    return nuevo_saldo, estado


def compute_kpis(obligaciones: list[dict], current_date: date) -> dict:
    """Calcula métricas KPI consolidadas de obligaciones."""
    start_of_week = current_date - timedelta(days=current_date.weekday())
    end_of_week = start_of_week + timedelta(days=6)

    total_pendiente = 0.0
    vencidas_monto = 0.0
    vencidas_count = 0
    vencen_semana_monto = 0.0
    vencen_semana_count = 0
    total_programado = 0.0

    for ob in obligaciones:
        estado = ob.get("estado", "pendiente")
        saldo = float(ob.get("saldo_pendiente", 0) or 0)

        if estado == "pagada" or saldo <= 0:
            continue

        total_pendiente += saldo

        # Parse dates
        fv = ob.get("fecha_vencimiento")
        if isinstance(fv, str):
            try:
                fv = date.fromisoformat(fv)
            except ValueError:
                fv = None

        fp = ob.get("fecha_programada_pago")
        if isinstance(fp, str):
            try:
                fp = date.fromisoformat(fp)
            except ValueError:
                fp = None

        # Check overdue
        if fv and fv < current_date:
            vencidas_monto += saldo
            vencidas_count += 1

        # Check due this week
        if fv and start_of_week <= fv <= end_of_week:
            vencen_semana_monto += saldo
            vencen_semana_count += 1

        # Check scheduled
        if fp:
            total_programado += saldo

    return {
        "total_pendiente": total_pendiente,
        "vencidas_monto": vencidas_monto,
        "vencidas_count": vencidas_count,
        "vencen_semana_monto": vencen_semana_monto,
        "vencen_semana_count": vencen_semana_count,
        "total_programado": total_programado,
    }


def filter_obligaciones_list(
    obligaciones: list[dict], estado: str, prioridad: str, categoria_id: Optional[int]
) -> list[dict]:
    """Filtra la lista de obligaciones según estado, prioridad y categoría."""
    res = []
    for ob in obligaciones:
        if estado != "Todos" and ob.get("estado") != estado:
            continue
        if prioridad != "Todas" and ob.get("prioridad") != prioridad:
            continue
        if categoria_id is not None and ob.get("categoria_id") != categoria_id:
            continue
        res.append(ob)
    return res


def _get_bank_accounts(client) -> tuple[str, list[dict]]:
    """Obtiene la lista de cuentas bancarias activas (intenta cuentas_bancarias y fallback a cuentas)."""
    try:
        resp = client.table("cuentas_bancarias").select("*").eq("activa", True).order("nombre").execute()
        if resp.data:
            return "cuentas_bancarias", resp.data
    except Exception:
        pass

    try:
        resp = client.table("cuentas").select("*").eq("activa", True).order("nombre").execute()
        if resp.data:
            return "cuentas", resp.data
    except Exception:
        pass

    return "cuentas_bancarias", []


def _get_categories(client) -> list[dict]:
    """Obtiene las categorías de egreso activas."""
    for tbl in ["categorias_egreso", "categorias"]:
        try:
            resp = client.table(tbl).select("*").order("nombre").execute()
            if resp.data:
                return resp.data
        except Exception:
            pass
    return []


def _find_semana_id(client, fecha: date) -> Optional[int]:
    """Busca el id de la semana correspondiente a una fecha dada."""
    try:
        resp = (
            client.table("semanas")
            .select("id")
            .lte("fecha_inicio", fecha.isoformat())
            .gte("fecha_fin", fecha.isoformat())
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]["id"]
    except Exception:
        pass

    # Fallback por iso year and week
    iso_year, iso_week, _ = fecha.isocalendar()
    try:
        resp = (
            client.table("semanas")
            .select("id")
            .eq("anio", iso_year)
            .eq("numero", iso_week)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]["id"]
    except Exception:
        pass

    return None


def render():
    st.title("💳 Gestión de Obligaciones y Cuentas por Pagar")
    st.caption("Administración unificada de pasivos, programación de pagos y trazabilidad bancaria.")

    client = get_client()
    can_edit = check_role(["admin", "editor"])
    today = date.today()

    # Cargar datos auxiliares
    accounts_table, bank_accounts = _get_bank_accounts(client)
    categories = _get_categories(client)

    # Cargar obligaciones
    try:
        ob_resp = client.table("obligaciones").select("*").order("fecha_programada_pago").execute()
        raw_obligaciones = ob_resp.data if ob_resp and ob_resp.data else []
    except Exception as e:
        st.error(f"Error al cargar obligaciones desde la base de datos: {e}")
        raw_obligaciones = []

    # Actualizar automáticamente estado 'vencida' si fecha_vencimiento < hoy y sigue pendiente
    for ob in raw_obligaciones:
        fv_str = ob.get("fecha_vencimiento")
        if fv_str and ob.get("estado") in ["pendiente", "reprogramada"]:
            try:
                fv_date = date.fromisoformat(fv_str)
                if fv_date < today and float(ob.get("saldo_pendiente", 0) or 0) > 0:
                    ob["estado"] = "vencida"
            except ValueError:
                pass

    # ── 1. KPI Summary Bar ──
    kpis = compute_kpis(raw_obligaciones, today)
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric(
            label="Total Pendiente",
            value=fmt_money(kpis["total_pendiente"]),
            help="Suma total de saldos pendientes de pago",
        )
    with col2:
        st.metric(
            label="Vencidas",
            value=fmt_money(kpis["vencidas_monto"]),
            delta=f"{kpis['vencidas_count']} obligaciones" if kpis['vencidas_count'] > 0 else "0 al día",
            delta_color="inverse" if kpis['vencidas_count'] > 0 else "normal",
        )
    with col3:
        st.metric(
            label="Vencen esta Semana",
            value=fmt_money(kpis["vencen_semana_monto"]),
            delta=f"{kpis['vencen_semana_count']} vencimientos",
        )
    with col4:
        st.metric(
            label="Total Programado",
            value=fmt_money(kpis["total_programado"]),
            help="Obligaciones con fecha programada asignada",
        )

    st.markdown("---")

    # ── 2. Action Bar: Nueva Obligación & Reprogramar ──
    if can_edit:
        act_col1, act_col2 = st.columns(2)
        with act_col1:
            with st.expander("➕ Nueva Obligación", expanded=False):
                with st.form("form_nueva_obligacion", clear_on_submit=True):
                    f_tercero = st.text_input("Tercero / Proveedor *", placeholder="Ej: Siemens S.A.")
                    
                    cat_options = {c["id"]: c["nombre"] for c in categories}
                    f_cat_id = (
                        st.selectbox(
                            "Categoría",
                            options=list(cat_options.keys()),
                            format_func=lambda x: cat_options[x],
                        )
                        if cat_options
                        else None
                    )
                    
                    f_concepto = st.text_input("Concepto / Descripción *", placeholder="Ej: Pago factura de insumos N-901")
                    
                    fc1, fc2 = st.columns(2)
                    with fc1:
                        f_monto = st.number_input("Monto Total ($) *", min_value=0.0, step=500000.0, format="%.0f")
                        f_fv = st.date_input("Fecha Vencimiento *", value=today)
                    with fc2:
                        f_prio = st.selectbox("Prioridad", ["alta", "media", "baja"], index=1)
                        f_fp = st.date_input("Fecha Programada Pago *", value=today)
                    
                    f_frec = st.selectbox(
                        "Frecuencia",
                        ["unica", "semanal", "quincenal", "mensual", "semestral", "anual"],
                        index=0,
                    )
                    
                    acc_options = {a["id"]: f"{a['nombre']} ({a.get('banco', '')})" for a in bank_accounts}
                    f_cuenta_id = (
                        st.selectbox(
                            "Cuenta Sugerida u Origen",
                            options=[None] + list(acc_options.keys()),
                            format_func=lambda x: "Sin asignar" if x is None else acc_options[x],
                        )
                        if bank_accounts
                        else None
                    )

                    submitted = st.form_submit_button("💾 Guardar Obligación")
                    if submitted:
                        if not f_tercero or not f_concepto or f_monto <= 0:
                            st.warning("Por favor completa los campos requeridos (*).")
                        else:
                            try:
                                payload = {
                                    "tercero": f_tercero,
                                    "categoria_id": f_cat_id,
                                    "concepto": f_concepto,
                                    "monto_total": f_monto,
                                    "saldo_pendiente": f_monto,
                                    "fecha_vencimiento": f_fv.isoformat(),
                                    "fecha_programada_pago": f_fp.isoformat(),
                                    "frecuencia": f_frec,
                                    "prioridad": f_prio,
                                    "estado": "pendiente",
                                    "cuenta_origen_id": f_cuenta_id,
                                }
                                client.table("obligaciones").insert(payload).execute()
                                st.success("✅ Obligación registrada exitosamente.")
                                st.rerun()
                            except Exception as ex:
                                st.error(f"Error al crear la obligación: {ex}")

        with act_col2:
            with st.expander("📅 Herramienta de Reprogramación", expanded=False):
                pending_obs = [ob for ob in raw_obligaciones if ob.get("estado") != "pagada"]
                if not pending_obs:
                    st.info("No hay obligaciones pendientes para reprogramar.")
                else:
                    with st.form("form_reprogramar"):
                        ob_map = {
                            o["id"]: f"#{o['id']} - {o['tercero']} ({fmt_money(o['saldo_pendiente'])}) - Prog: {o.get('fecha_programada_pago')}"
                            for o in pending_obs
                        }
                        selected_ob_id = st.selectbox(
                            "Seleccionar Obligación",
                            options=list(ob_map.keys()),
                            format_func=lambda x: ob_map[x],
                        )
                        nueva_fecha_pago = st.date_input("Nueva Fecha Programada de Pago", value=today)

                        reprog_sub = st.form_submit_button("🔄 Actualizar Fecha Programada")
                        if reprog_sub and selected_ob_id:
                            try:
                                client.table("obligaciones").update({
                                    "fecha_programada_pago": nueva_fecha_pago.isoformat(),
                                    "estado": "reprogramada",
                                }).eq("id", selected_ob_id).execute()
                                st.success("✅ Fecha programada actualizada.")
                                st.rerun()
                            except Exception as ex:
                                st.error(f"Error al reprogramar: {ex}")

    # ── 3. Filter Bar ──
    fil_col1, fil_col2, fil_col3 = st.columns(3)
    with fil_col1:
        f_estado = st.selectbox(
            "Filtrar por Estado",
            ["Todos", "pendiente", "parcial", "pagada", "vencida", "reprogramada"],
            key="fil_ob_estado",
        )
    with fil_col2:
        f_prio = st.selectbox(
            "Filtrar por Prioridad",
            ["Todas", "alta", "media", "baja"],
            key="fil_ob_prio",
        )
    with fil_col3:
        cat_filter_map = {"Todas": None}
        for c in categories:
            cat_filter_map[c["nombre"]] = c["id"]
        selected_cat_name = st.selectbox(
            "Filtrar por Categoría",
            options=list(cat_filter_map.keys()),
            key="fil_ob_cat",
        )
        selected_cat_id = cat_filter_map[selected_cat_name]

    # Aplicar filtros
    filtered_obligaciones = filter_obligaciones_list(
        raw_obligaciones, f_estado, f_prio, selected_cat_id
    )

    st.subheader(f"📋 Lista de Obligaciones ({len(filtered_obligaciones)})")

    if not filtered_obligaciones:
        st.info("No hay obligaciones que coincidan con los filtros seleccionados.")
        return

    # Badges
    prio_badges = {"alta": "🔴 Alta", "media": "🟡 Media", "baja": "🟢 Baja"}
    estado_badges = {
        "pendiente": "⏳ Pendiente",
        "parcial": "🌗 Parcial",
        "pagada": "✅ Pagada",
        "vencida": "❌ Vencida",
        "reprogramada": "🔄 Reprogramada",
    }

    # ── 4. Accordion List of Obligations ──
    for ob in filtered_obligaciones:
        ob_id = ob["id"]
        tercero = ob["tercero"]
        monto_total = float(ob.get("monto_total", 0) or 0)
        saldo_pendiente = float(ob.get("saldo_pendiente", 0) or 0)
        est = ob.get("estado", "pendiente")
        prio = ob.get("prioridad", "media")
        fv = ob.get("fecha_vencimiento", "-")
        fp = ob.get("fecha_programada_pago", "-")

        prio_tag = prio_badges.get(prio, prio)
        est_tag = estado_badges.get(est, est)

        title = f"{est_tag} | {prio_tag} | **{tercero}** — {ob.get('concepto', '')} | Saldo: **{fmt_money(saldo_pendiente)}** / Total: {fmt_money(monto_total)} | Vence: {fv}"

        with st.expander(title, expanded=False):
            dcol1, dcol2, dcol3 = st.columns(3)
            with dcol1:
                st.write(f"**Tercero:** {tercero}")
                st.write(f"**Concepto:** {ob.get('concepto', 'N/A')}")
                # Buscar nombre de categoría
                cat_name = "N/A"
                if ob.get("categoria_id"):
                    for c in categories:
                        if c["id"] == ob["categoria_id"]:
                            cat_name = c["nombre"]
                            break
                st.write(f"**Categoría:** {cat_name}")
            with dcol2:
                st.write(f"**Monto Total:** {fmt_money(monto_total)}")
                st.write(f"**Saldo Pendiente:** {fmt_money(saldo_pendiente)}")
                st.write(f"**Frecuencia:** {ob.get('frecuencia', 'unica').capitalize()}")
            with dcol3:
                st.write(f"**Fecha Vencimiento:** {fv}")
                st.write(f"**Fecha Programada:** {fp}")
                st.write(f"**Prioridad:** {prio.capitalize()}")

            st.markdown("---")

            # 💳 Payment Section
            if can_edit and est != "pagada" and saldo_pendiente > 0:
                st.markdown("#### 💳 Registrar Pago")
                with st.form(key=f"form_pago_{ob_id}"):
                    pcol1, pcol2 = st.columns(2)
                    with pcol1:
                        if not bank_accounts:
                            st.warning("No hay cuentas bancarias registradas/activas.")
                            selected_cuenta_id = None
                        else:
                            acc_dict = {a["id"]: f"{a['nombre']} ({a.get('banco', '')}) - Saldo: {fmt_money(a.get('saldo', 0))}" for a in bank_accounts}
                            selected_cuenta_id = st.selectbox(
                                "Cuenta Bancaria de Origen *",
                                options=list(acc_dict.keys()),
                                format_func=lambda x: acc_dict[x],
                                key=f"pago_cuenta_{ob_id}",
                            )
                        
                        pago_monto = st.number_input(
                            "Monto a Pagar ($) *",
                            min_value=1.0,
                            max_value=saldo_pendiente,
                            value=saldo_pendiente,
                            step=100000.0,
                            format="%.0f",
                            key=f"pago_monto_{ob_id}",
                        )
                    with pcol2:
                        pago_fecha = st.date_input(
                            "Fecha del Pago *",
                            value=today,
                            key=f"pago_fecha_{ob_id}",
                        )
                        pago_ref = st.text_input(
                            "Referencia / Comprobante",
                            placeholder="Ej: TRF-102938",
                            key=f"pago_ref_{ob_id}",
                        )

                    exec_pago = st.form_submit_button("💳 Ejecutar Pago")
                    if exec_pago:
                        if not selected_cuenta_id:
                            st.error("Debes seleccionar una cuenta bancaria.")
                        elif pago_monto <= 0:
                            st.error("El monto debe ser mayor a 0.")
                        else:
                            try:
                                # 1. Calcular nuevo saldo y estado
                                nuevo_saldo, nuevo_estado = calculate_payment_remaining(
                                    monto_total=monto_total,
                                    monto_pagado=pago_monto,
                                    current_saldo=saldo_pendiente,
                                )

                                # 2. Obtener semana_id
                                semana_id = _find_semana_id(client, pago_fecha)

                                # 3. Insertar registro en pagos_obligaciones
                                client.table("pagos_obligaciones").insert({
                                    "obligacion_id": ob_id,
                                    "cuenta_id": selected_cuenta_id,
                                    "semana_id": semana_id,
                                    "monto_pagado": pago_monto,
                                    "fecha_pago": pago_fecha.isoformat(),
                                    "comprobante_ref": pago_ref or None,
                                }).execute()

                                # 4. Actualizar obligacion (saldo_pendiente y estado)
                                client.table("obligaciones").update({
                                    "saldo_pendiente": nuevo_saldo,
                                    "estado": nuevo_estado,
                                }).eq("id", ob_id).execute()

                                # 5. Restar saldo en cuenta bancaria
                                account_obj = next((a for a in bank_accounts if a["id"] == selected_cuenta_id), None)
                                if account_obj:
                                    saldo_cuenta_actual = float(account_obj.get("saldo", 0) or 0)
                                    nuevo_saldo_cuenta = saldo_cuenta_actual - pago_monto
                                    try:
                                        client.table(accounts_table).update({"saldo": nuevo_saldo_cuenta}).eq("id", selected_cuenta_id).execute()
                                    except Exception:
                                        pass

                                # 6. Registrar en la tabla de egresos para trazabilidad en la semana
                                if semana_id:
                                    try:
                                        client.table("egresos").insert({
                                            "semana_id": semana_id,
                                            "categoria_id": ob.get("categoria_id"),
                                            "valor": pago_monto,
                                            "descripcion": f"Pago obligación #{ob_id} - {tercero} ({pago_ref or ''})".strip(),
                                        }).execute()
                                    except Exception:
                                        pass

                                st.success(f"✅ Pago de {fmt_money(pago_monto)} registrado correctamente.")
                                st.rerun()
                            except Exception as ex:
                                st.error(f"Error procesando el pago: {ex}")

            # 📜 Payment History
            try:
                pagos_resp = (
                    client.table("pagos_obligaciones")
                    .select("*")
                    .eq("obligacion_id", ob_id)
                    .order("created_at", desc=True)
                    .execute()
                )
                if pagos_resp and pagos_resp.data:
                    st.markdown("#### 📜 Historial de Pagos")
                    for p in pagos_resp.data:
                        st.caption(
                            f"• **{fmt_date(p.get('fecha_pago'))}**: {fmt_money(p.get('monto_pagado'))} "
                            f"(Ref: {p.get('comprobante_ref') or 'N/A'}) - ID Cuenta: {p.get('cuenta_id')}"
                        )
            except Exception:
                pass


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Obligaciones - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
