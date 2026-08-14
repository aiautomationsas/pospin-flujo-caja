"""Importar datos desde Excel."""
import streamlit as st
import tempfile
import os
from core.auth import check_role
from core.database import get_client
from core.importer import parse_excel, import_to_db, register_import
from utils.format import fmt_date


def render():
    st.title("📥 Adquisición de Datos")

    if not check_role(["admin", "editor"]):
        st.warning("🔒 Solo lectura — necesitas rol de editor o administrador para importar datos.")
        st.stop()

    client = get_client()

    tab_excel, tab_siigo = st.tabs(["📥 Importar Excel", "🔌 Sincronización SIIGO"])

    with tab_excel:
        st.warning("⚠️ La importación no elimina datos existentes. Si hay duplicados, se omitirán.")
        
        # ── Upload ──
        uploaded_file = st.file_uploader("Selecciona un archivo .xlsx", type=["xlsx"])

        if uploaded_file is not None:
            # Save to temp file for parsing
            with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
                tmp.write(uploaded_file.getvalue())
                tmp_path = tmp.name

            try:
                parsed = parse_excel(tmp_path)
            except Exception as e:
                st.error(f"Error al leer el archivo: {e}")
                os.unlink(tmp_path)
                st.stop()
            finally:
                # Cleanup temp file after parsing
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            # ── Preview ──
            st.subheader("📋 Vista previa")

            sheets = parsed.get("sheets_found", [])
            st.text(f"Hojas encontradas: {', '.join(sheets) if sheets else 'ninguna'}")

            # Bancos
            if parsed.get("bancos"):
                with st.expander(f"🏦 Bancos ({len(parsed['bancos'])} filas)"):
                    st.dataframe(parsed["bancos"][:5], use_container_width=True)

            # Flujo
            if parsed.get("flujo"):
                flujo = parsed["flujo"]
                facturas = flujo.get("facturas", [])
                egresos = flujo.get("egresos", [])
                with st.expander(f"💰 Flujo ({len(facturas)} facturas, {len(egresos)} categorías de egreso)"):
                    if facturas:
                        st.markdown("**Facturas:**")
                        st.dataframe(facturas[:5], use_container_width=True)
                    if egresos:
                        st.markdown("**Egresos:**")
                        st.dataframe(egresos[:5], use_container_width=True)

            # Compromisos
            if parsed.get("compromisos"):
                with st.expander(f"📋 Compromisos ({len(parsed['compromisos'])} registros)"):
                    st.dataframe(parsed["compromisos"][:5], use_container_width=True)

            # ── Import button ──
            st.markdown("---")
            if st.button("📤 Importar a Base de Datos", type="primary"):
                with st.spinner("Importando datos..."):
                    try:
                        count = import_to_db(client, parsed)
                        register_import(
                            client,
                            filename=uploaded_file.name,
                            sheets=", ".join(sheets),
                            count=count,
                            success=True,
                        )
                        st.success(f"✅ Importación exitosa. {count} registros insertados/actualizados.")
                    except Exception as e:
                        register_import(
                            client,
                            filename=uploaded_file.name,
                            sheets=", ".join(sheets),
                            count=0,
                            success=False,
                        )
                        st.error(f"Error durante la importación: {e}")

    with tab_siigo:
        st.subheader("Sincronización Directa de Cartera (SIIGO)")
        st.markdown(
            "Esta integración consulta las facturas de venta reales y clientes en SIIGO mediante la API oficial, "
            "y actualiza automáticamente el Flujo de Caja. Las fechas estimadas de recaudo locales no se sobrescriben."
        )

        # Cargar secretos por defecto si existen
        siigo_secrets = st.secrets.get("siigo", {}) if hasattr(st, "secrets") else {}
        default_username = siigo_secrets.get("username", "") if siigo_secrets else ""
        default_partner_id = siigo_secrets.get("partner_id", "") if siigo_secrets else ""

        with st.form("form_siigo_sync"):
            st.markdown("**Credenciales de Acceso a SIIGO**")
            col1, col2 = st.columns(2)
            with col1:
                username = st.text_input("Usuario (Email)", value=default_username, key="siigo_username_input")
                access_key = st.text_input("Access Key (Token API)", type="password", key="siigo_key_input")
            with col2:
                partner_id = st.text_input("Partner ID", value=default_partner_id, key="siigo_partner_input")
                base_url = st.selectbox("Ambiente", ["https://api.siigo.com", "https://sandbox.api.siigo.com"], key="siigo_url_input")

            dias_atras = st.slider("Importar facturas de los últimos (días):", min_value=30, max_value=365, value=90)
            
            submit_sync = st.form_submit_button("⚡ Iniciar Sincronización")

        if submit_sync:
            if not username or not access_key or not partner_id:
                st.error("Todos los campos de credenciales son obligatorios para conectar a SIIGO.")
            else:
                with st.spinner("Conectando con SIIGO y sincronizando datos..."):
                    try:
                        from core.siigo_api import SiigoAPIClient, sincronizar_cartera_siigo
                        siigo_client = SiigoAPIClient(
                            username=username,
                            access_key=access_key,
                            partner_id=partner_id,
                            base_url=base_url
                        )
                        
                        stats = sincronizar_cartera_siigo(client, siigo_client)
                        
                        total_registros = stats["clientes_creados"] + stats["facturas_creadas"] + stats["facturas_actualizadas"]
                        register_import(
                            client,
                            filename=f"SIIGO API ({dias_atras} días)",
                            sheets="Cartera y Clientes",
                            count=total_registros,
                            success=True
                        )
                        
                        st.success(f"✅ Sincronización completada con éxito.")
                        st.balloons()
                        st.metric("Clientes Creados/Reutilizados", stats["clientes_creados"])
                        col_creadas, col_act = st.columns(2)
                        with col_creadas:
                            st.metric("Facturas Creadas", stats["facturas_creadas"])
                        with col_act:
                            st.metric("Facturas Actualizadas", stats["facturas_actualizadas"])
                    except Exception as e:
                        register_import(
                            client,
                            filename="SIIGO API (Fallo)",
                            sheets="N/A",
                            count=0,
                            success=False
                        )
                        st.error(f"Fallo en la sincronización: {e}")

    # ── Import history ──
    st.markdown("---")
    st.subheader("📜 Historial de Adquisiciones")

    history_resp = client.table("importaciones").select("*").order("fecha", desc=True).limit(20).execute()
    if history_resp.data:
        for imp in history_resp.data:
            status = "✅" if imp["exitosa"] else "❌"
            st.text(f"{status} {imp['archivo']} — {fmt_date(imp.get('fecha'))} — {imp['registros']} registros")
    else:
        st.info("No hay adquisiciones previas.")


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Importar - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
