"""Importar datos desde Excel."""
import streamlit as st
import tempfile
import os
from core.auth import check_role
from core.database import get_client
from core.importer import parse_excel, import_to_db, register_import
from utils.format import fmt_date


def render():
    st.title("📥 Importar Datos desde Excel")

    if not check_role(["admin", "editor"]):
        st.warning("🔒 Solo lectura — necesitas rol de editor o administrador para importar datos.")
        st.stop()

    st.warning("⚠️ La importación no elimina datos existentes. Si hay duplicados, se omitirán.")

    client = get_client()

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

    # ── Import history ──
    st.markdown("---")
    st.subheader("📜 Historial de Importaciones")

    history_resp = client.table("importaciones").select("*").order("fecha", desc=True).limit(20).execute()
    if history_resp.data:
        for imp in history_resp.data:
            status = "✅" if imp["exitosa"] else "❌"
            st.text(f"{status} {imp['archivo']} — {fmt_date(imp.get('fecha'))} — {imp['registros']} registros")
    else:
        st.info("No hay importaciones previas.")


# Support direct execution via Streamlit multi-page auto-discovery
if __name__ == "__main__":
    st.set_page_config(page_title="Importar - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
