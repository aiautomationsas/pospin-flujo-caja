"""Compromisos especiales (módulo heredado redirigido a Obligaciones)."""
import streamlit as st
from pages.obligaciones import render as render_obligaciones


def render():
    """Redirige y renderiza el módulo unificado de Obligaciones (Cuentas por Pagar)."""
    st.info("ℹ️ La gestión de compromisos ha sido unificada en el nuevo módulo de **Obligaciones (Cuentas por Pagar)**.")
    render_obligaciones()


if __name__ == "__main__":
    st.set_page_config(page_title="Obligaciones - Flujo de Caja", layout="wide")
    from core.auth import require_auth
    require_auth()
    render()
