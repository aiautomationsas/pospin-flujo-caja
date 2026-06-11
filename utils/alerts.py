"""Alert detection utilities for cash flow projections."""


DEFICIT_WARNING_THRESHOLD = 10_000_000  # COP
DEFICIT_CRITICAL_THRESHOLD = 50_000_000  # COP


def detect_deficits(proyeccion_data: list[dict]) -> list[dict]:
    """Returns list of weeks with negative balance from projection data.
    
    Each item in proyeccion_data should have keys: semana, anio, saldo_final, fecha_inicio.
    Returns list of dicts with: semana, anio, saldo_final, deficit.
    """
    deficits = []
    for week in proyeccion_data:
        saldo = week.get("saldo_final", 0)
        if saldo < 0:
            deficits.append({
                "semana": week.get("semana"),
                "anio": week.get("anio"),
                "fecha_inicio": week.get("fecha_inicio"),
                "saldo_final": saldo,
                "deficit": abs(saldo),
            })
    return deficits


def alert_severity(deficit_amount: float) -> str:
    """Returns 'critical' or 'warning' based on deficit amount."""
    if abs(deficit_amount) >= DEFICIT_CRITICAL_THRESHOLD:
        return "critical"
    return "warning"
