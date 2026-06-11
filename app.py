"""Flujo de Caja — Grupo Pospin | App principal."""
import streamlit as st
from core.auth import login, logout, get_current_user

st.set_page_config(page_title="Flujo de Caja — Grupo Pospin", page_icon="💰", layout="wide")

# ── Login page ──
if not get_current_user():
    st.title("💰 Flujo de Caja — Grupo Pospin")
    st.markdown("---")
    st.subheader("Iniciar Sesión")

    with st.form("login_form"):
        email = st.text_input("Correo electrónico", placeholder="usuario@empresa.com")
        password = st.text_input("Contraseña", type="password")
        submit = st.form_submit_button("Ingresar")

        if submit:
            if not email or not password:
                st.error("Por favor ingresa correo y contraseña.")
            else:
                try:
                    login(email, password)
                    st.rerun()
                except Exception as e:
                    st.error(f"Error de autenticación: {e}")

    st.caption("Sistema de proyección de flujo de caja semanal.")
    st.stop()

# ── Authenticated: sidebar navigation ──
user = get_current_user()

with st.sidebar:
    st.title("💰 Grupo Pospin")
    st.markdown(f"**{user['full_name'] or user['email']}**")
    st.caption(f"Rol: {user['role'].capitalize()}")
    st.markdown("---")

    # Navigation
    page = st.radio(
        "Navegación",
        ["Dashboard", "Actualizar", "Importar", "Compromisos", "Configuración"],
        label_visibility="collapsed",
    )

    # Hide Configuración for non-admin users
    if user["role"] != "admin" and page == "Configuración":
        page = "Dashboard"

    st.markdown("---")
    if st.button("Cerrar Sesión"):
        logout()
        st.rerun()

# ── Page routing ──
if page == "Dashboard":
    from pages.dashboard import render
    render()
elif page == "Actualizar":
    from pages.actualizar import render as render_actualizar
    render_actualizar()
elif page == "Importar":
    from pages.importar import render as render_importar
    render_importar()
elif page == "Compromisos":
    from pages.compromisos import render as render_compromisos
    render_compromisos()
elif page == "Configuración":
    from pages.configuracion import render as render_configuracion
    render_configuracion()
