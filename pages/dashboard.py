"""Dashboard principal — proyección de flujo de caja."""
import streamlit as st
import plotly.graph_objects as go
from core.database import get_client
from core.proyeccion import MotorProyeccion
from utils.format import fmt_money, semana_label
from utils.alerts import detect_deficits, alert_severity
from utils.export import export_excel, export_pdf


def render():
    st.title("💰 Flujo de Caja — Grupo Pospin")
    st.markdown("---")

    client = get_client()
    motor = MotorProyeccion(client)

    # Generate future weeks if needed
    try:
        motor.generar_semanas_futuras(n=12)
    except Exception as e:
        st.warning(f"No se pudieron generar semanas futuras: {e}")

    # Calculate projection
    proyeccion = motor.calcular(semanas=12)

    # ── Alert panel ──
    deficits = detect_deficits(proyeccion)
    if deficits:
        alert_text = "⚠️ **SEMANAS CON DÉFICIT DETECTADO:**\n\n"
        for d in deficits:
            sev = alert_severity(d["deficit"])
            icon = "🔴" if sev == "critical" else "🟡"
            alert_text += f"- {icon} **{semana_label(d['semana'], d['anio'])}**: Déficit de {fmt_money(d['deficit'])}\n"
        alert_text += f"\n*Acción requerida: Revisar programación de pagos y acelerar recaudo.*"
        st.error(alert_text)
    else:
        if proyeccion:
            st.success("✅ No se detectaron semanas con saldo negativo en las próximas 12 semanas.")
        else:
            st.info("📭 No hay datos aún. Importa un Excel o agrega datos manualmente.")

    if not proyeccion:
        st.stop()

    tab_proyeccion, tab_calibracion = st.tabs(["📊 Proyección Semanal", "⚖️ Calibración (Estimado vs. Real)"])

    with tab_proyeccion:
        # ── Congelar semana ──
        if proyeccion:
            col_sem, col_btn = st.columns([3, 1])
            with col_sem:
                sem_actual = proyeccion[0]
                st.markdown(f"**Semana Actual:** {semana_label(sem_actual['semana'], sem_actual['anio'])} (Saldo final proyectado: {fmt_money(sem_actual['saldo_final'])})")
            with col_btn:
                if st.button("❄️ Congelar Estimación", help="Guarda la proyección de esta semana en el histórico para comparar desvíos reales después"):
                    try:
                        motor.guardar_snapshot(
                            sem_actual["semana_id"],
                            sem_actual["recaudo"],
                            sem_actual["egresos"],
                            sem_actual["saldo_final"]
                        )
                        st.success("✅ Estimación de la semana congelada correctamente.")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error al congelar estimación: {e}")

        # ── Plotly line chart ──
        st.subheader("📈 Proyección de Saldo (12 semanas)")

        labels = [semana_label(p["semana"], p["anio"]) for p in proyeccion]
        saldos = [p["saldo_final"] for p in proyeccion]

        min_saldo = min(saldos)
        max_saldo = max(saldos)
        padding = max(abs(max_saldo), abs(min_saldo)) * 0.15 or 5_000_000
        y_min = min(min_saldo - padding, -padding)
        y_max = max_saldo + padding

        colors = ["#d62728" if s < 0 else "#1f77b4" for s in saldos]

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=labels,
            y=saldos,
            mode="lines+markers",
            name="Saldo Proyectado",
            line=dict(color="#1f77b4", width=3),
            marker=dict(size=10, color=colors),
        ))
        fig.add_hline(y=0, line_dash="dash", line_color="gray")
        fig.update_layout(
            xaxis_title="Semana",
            yaxis_title="Saldo (COP)",
            yaxis=dict(range=[y_min, y_max], tickformat=",.0f"),
            height=400,
            margin=dict(l=20, r=20, t=30, b=20),
            hovermode="x unified",
        )
        st.plotly_chart(fig, use_container_width=True)

        # ── Data table ──
        st.subheader("📊 Detalle Semanal")

        table_rows = []
        for p in proyeccion:
            table_rows.append({
                "Semana": semana_label(p["semana"], p["anio"]),
                "Saldo Inicial": fmt_money(p["saldo_inicial"]),
                "Recaudo Proyectado": fmt_money(p["recaudo"]),
                "Egresos Proyectados": fmt_money(p["egresos"]),
                "Saldo Final Proyectado": fmt_money(p["saldo_final"]),
            })

        st.dataframe(table_rows, use_container_width=True, hide_index=True)

        # ── Two columns below ──
        col1, col2 = st.columns(2)

        with col1:
            st.subheader("🏦 Saldos por Cuenta (Semana Actual)")
            if proyeccion:
                current_semana_id = proyeccion[0]["semana_id"]
                saldos_cuenta = motor.saldo_por_cuenta(current_semana_id)
                if saldos_cuenta:
                    for sc in saldos_cuenta:
                        st.metric(
                            label=f"{sc['nombre']} ({sc['banco']} - {sc['numero']})",
                            value=fmt_money(sc["saldo"]),
                        )
                else:
                    st.info("No hay saldos registrados para la semana actual.")

        with col2:
            st.subheader("🧾 Recaudo Pendiente por Cliente")
            recaudos = motor.recaudo_pendiente()
            if recaudos:
                for r in recaudos:
                    with st.expander(f"{r['cliente']} — Pendiente: {fmt_money(r['total_pendiente'])}"):
                        for fac in r["facturas"]:
                            st.text(f"  Factura {fac['numero']}: {fmt_money(fac['valor'])} (pendiente: {fmt_money(fac['pendiente'])})")
            else:
                st.info("No hay recaudos pendientes.")

        # ── Export buttons ──
        st.markdown("---")
        st.subheader("📤 Exportar Reporte")
        exp_col1, exp_col2 = st.columns(2)

        # Prepare export data
        current_semana_id = proyeccion[0]["semana_id"] if proyeccion else None
        saldos_export = motor.saldo_por_cuenta(current_semana_id) if current_semana_id else []
        recaudos_export = motor.recaudo_pendiente()

        with exp_col1:
            excel_data = export_excel(proyeccion, saldos_export, recaudos_export)
            st.download_button(
                "📊 Exportar Excel",
                data=excel_data,
                file_name="proyeccion_flujo_caja.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
            )
        with exp_col2:
            pdf_data = export_pdf(proyeccion, saldos_export, recaudos_export)
            st.download_button(
                "📄 Exportar PDF",
                data=pdf_data,
                file_name="proyeccion_flujo_caja.pdf",
                mime="application/pdf",
                use_container_width=True,
            )

    with tab_calibracion:
        st.subheader("⚖️ Calibración Histórica (Estimado vs. Real)")
        calibracion = motor.obtener_calibracion(limite_semanas=4)
        
        if not calibracion:
            st.info("No hay estimaciones congeladas en el histórico para comparar.")
        else:
            st.markdown("Comparación de las últimas semanas que fueron congeladas contra los resultados reales registrados:")
            
            # Tabla de desviaciones
            cal_rows = []
            for c in calibracion:
                cal_rows.append({
                    "Semana": semana_label(c["semana"], c["anio"]),
                    "Recaudo Estimado": fmt_money(c["recaudo_estimado"]),
                    "Recaudo Real": fmt_money(c["recaudo_real"]),
                    "Desvío Recaudo": fmt_money(c["recaudo_desvio"]),
                    "Egresos Estimado": fmt_money(c["egresos_estimado"]),
                    "Egresos Real": fmt_money(c["egresos_real"]),
                    "Desvío Egresos": fmt_money(c["egresos_desvio"]),
                })
            st.dataframe(cal_rows, use_container_width=True, hide_index=True)
            
            # Gráfico de barras comparativo de desvíos de recaudo
            semanas_labels = [f"Sem {c['semana']}" for c in calibracion]
            recaudos_est = [c["recaudo_estimado"] for c in calibracion]
            recaudos_real = [c["recaudo_real"] for c in calibracion]
            egresos_est = [c["egresos_estimado"] for c in calibracion]
            egresos_real = [c["egresos_real"] for c in calibracion]
            
            fig_cal = go.Figure()
            fig_cal.add_trace(go.Bar(
                x=semanas_labels,
                y=recaudos_est,
                name="Recaudo Estimado",
                marker_color="#1f77b4"
            ))
            fig_cal.add_trace(go.Bar(
                x=semanas_labels,
                y=recaudos_real,
                name="Recaudo Real",
                marker_color="#ff7f0e"
            ))
            fig_cal.update_layout(
                title="Recaudos: Proyectado vs. Ejecutado",
                barmode="group",
                height=300,
                margin=dict(l=20, r=20, t=30, b=20),
            )
            st.plotly_chart(fig_cal, use_container_width=True)
            
            fig_cal_eg = go.Figure()
            fig_cal_eg.add_trace(go.Bar(
                x=semanas_labels,
                y=egresos_est,
                name="Egresos Estimado",
                marker_color="#d62728"
            ))
            fig_cal_eg.add_trace(go.Bar(
                x=semanas_labels,
                y=egresos_real,
                name="Egresos Real",
                marker_color="#2ca02c"
            ))
            fig_cal_eg.update_layout(
                title="Egresos: Proyectado vs. Ejecutado",
                barmode="group",
                height=300,
                margin=dict(l=20, r=20, t=30, b=20),
            )
            st.plotly_chart(fig_cal_eg, use_container_width=True)


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Dashboard - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
