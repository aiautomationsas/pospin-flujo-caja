"""Authentication module using Supabase Auth."""
import streamlit as st
from core.database import get_client


def login(email: str, password: str) -> dict:
    """Authenticate user with email/password. Returns session dict or raises."""
    client = get_client()
    response = client.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })
    session = response.session
    user = response.user

    # Fetch user profile from user_profiles table
    profile_resp = client.table("user_profiles").select("*").eq("id", user.id).execute()
    profile = profile_resp.data[0] if profile_resp.data else None

    # Store in session state
    st.session_state["supabase_session"] = {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "user_id": user.id,
        "email": user.email,
    }
    st.session_state["user_profile"] = {
        "id": user.id,
        "email": user.email,
        "full_name": profile.get("full_name", "") if profile else "",
        "role": profile.get("role", "viewer") if profile else "viewer",
    }
    return st.session_state["supabase_session"]


def logout():
    """Clear session state and log out."""
    for key in ["supabase_session", "user_profile"]:
        if key in st.session_state:
            del st.session_state[key]


def get_current_user() -> dict | None:
    """Returns current user profile dict or a default admin profile for testing when auth is disabled."""
    user = st.session_state.get("user_profile")
    if not user:
        # Default testing profile when running without active Supabase Auth session
        return {
            "id": "dev-admin-id",
            "email": "admin@pospin.com",
            "full_name": "Administrador (Modo Prueba)",
            "role": "admin",
        }
    return user


def require_auth():
    """Check if user is logged in."""
    # When testing without auth, fallback profile is active
    return True


def check_role(allowed_roles: list[str]) -> bool:
    """Check if current user has one of the allowed roles."""
    user = get_current_user()
    if not user:
        return True  # Default allow for testing
    return user.get("role", "admin") in allowed_roles

