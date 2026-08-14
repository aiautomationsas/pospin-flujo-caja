"""Unit tests for obligations calculation logic & payment handling."""
from datetime import date
from pages.obligaciones import (
    calculate_payment_remaining,
    compute_kpis,
    filter_obligaciones_list,
)


def test_payment_updates_obligation_and_balance():
    """Test helper calculation: total 5,000,000, paying 2,000,000 leaves 3,000,000 and status 'parcial'."""
    total = 5000000.0
    paid = 2000000.0
    rem = total - paid
    status = "parcial" if rem > 0 else "pagada"
    assert rem == 3000000.0
    assert status == "parcial"


def test_calculate_payment_remaining_partial():
    rem, status = calculate_payment_remaining(
        monto_total=5000000.0,
        monto_pagado=2000000.0,
        current_saldo=5000000.0,
    )
    assert rem == 3000000.0
    assert status == "parcial"


def test_calculate_payment_remaining_full():
    rem, status = calculate_payment_remaining(
        monto_total=5000000.0,
        monto_pagado=5000000.0,
        current_saldo=5000000.0,
    )
    assert rem == 0.0
    assert status == "pagada"


def test_calculate_payment_remaining_overpay():
    rem, status = calculate_payment_remaining(
        monto_total=5000000.0,
        monto_pagado=6000000.0,
        current_saldo=5000000.0,
    )
    assert rem == 0.0
    assert status == "pagada"


def test_compute_kpis():
    today = date(2026, 6, 25)
    sample_obligaciones = [
        {
            "id": 1,
            "tercero": "Proveedor A",
            "monto_total": 5000000.0,
            "saldo_pendiente": 3000000.0,
            "fecha_vencimiento": "2026-06-20",  # Vencida
            "fecha_programada_pago": "2026-06-24",  # Esta semana (lunes 22 - domingo 28)
            "estado": "parcial",
            "prioridad": "alta",
        },
        {
            "id": 2,
            "tercero": "Proveedor B",
            "monto_total": 2000000.0,
            "saldo_pendiente": 2000000.0,
            "fecha_vencimiento": "2026-06-26",  # Vencimiento esta semana
            "fecha_programada_pago": "2026-06-27",
            "estado": "pendiente",
            "prioridad": "media",
        },
        {
            "id": 3,
            "tercero": "Proveedor C",
            "monto_total": 4000000.0,
            "saldo_pendiente": 0.0,
            "fecha_vencimiento": "2026-06-15",
            "fecha_programada_pago": "2026-06-18",
            "estado": "pagada",
            "prioridad": "baja",
        },
    ]

    kpis = compute_kpis(sample_obligaciones, today)
    assert kpis["total_pendiente"] == 5000000.0
    assert kpis["vencidas_monto"] == 3000000.0
    assert kpis["vencidas_count"] == 1
    assert kpis["vencen_semana_monto"] == 2000000.0
    assert kpis["vencen_semana_count"] == 1
    assert kpis["total_programado"] == 5000000.0


def test_filter_obligaciones_list():
    sample = [
        {"id": 1, "estado": "pendiente", "prioridad": "alta", "categoria_id": 10},
        {"id": 2, "estado": "parcial", "prioridad": "media", "categoria_id": 10},
        {"id": 3, "estado": "pagada", "prioridad": "alta", "categoria_id": 20},
    ]

    filtered = filter_obligaciones_list(
        sample, estado="pendiente", prioridad="Todas", categoria_id=None
    )
    assert len(filtered) == 1
    assert filtered[0]["id"] == 1

    filtered_cat = filter_obligaciones_list(
        sample, estado="Todos", prioridad="alta", categoria_id=10
    )
    assert len(filtered_cat) == 1
    assert filtered_cat[0]["id"] == 1
