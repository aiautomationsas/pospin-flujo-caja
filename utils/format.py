"""Utility functions for formatting values."""
from datetime import date, datetime


def fmt_money(val) -> str:
    """Format a monetary value as Colombian pesos (no decimals): $1.234.567"""
    if val is None:
        return "$0"
    try:
        num = int(round(float(val)))
    except (ValueError, TypeError):
        return "$0"
    # Colombian format: periods as thousands separator
    return f"${num:,}".replace(",", ".")


def fmt_date(val) -> str:
    """Format a date as YYYY-MM-DD."""
    if val is None:
        return "-"
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.isoformat()
    return str(val)


def semana_label(semana: int, anio: int) -> str:
    """Format a week label: 'Semana 24 (2026)'"""
    return f"Semana {semana} ({anio})"
