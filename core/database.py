"""Supabase client initialization."""
import os
import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def get_client() -> Client:
    """Returns a Supabase client using the anon key (for authenticated user operations)."""
    url = _get_secret("SUPABASE_URL")
    key = _get_secret("SUPABASE_ANON_KEY")
    if not url or not key:
        st.error("Configuración incompleta: faltan SUPABASE_URL y/o SUPABASE_ANON_KEY en .streamlit/secrets.toml o variables de entorno.")
        st.stop()
    return create_client(url, key)


@st.cache_resource
def get_service_client() -> Client:
    """Returns a Supabase client using the service role key (for admin/bypass operations)."""
    url = _get_secret("SUPABASE_URL")
    key = _get_secret("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        st.error("Configuración incompleta: falta SUPABASE_SERVICE_ROLE_KEY para operaciones admin.")
        st.stop()
    return create_client(url, key)


def _get_secret(key: str) -> str | None:
    """Read a secret from st.secrets or environment variables."""
    try:
        val = st.secrets[key]
        if val:
            return str(val)
    except (KeyError, FileNotFoundError):
        pass
    return os.environ.get(key)
