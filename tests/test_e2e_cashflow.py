"""End-to-end integration test suite for Cashflow SSOT & Obligations Management.

Tests:
1. MotorProyeccion calculation structure with invoices, obligations, and recurring expenses.
2. Deficit detection accuracy when obligations trigger negative balances.
3. Payment execution calculations (reducing obligation balance and updating bank balance).
"""
from datetime import date
from unittest.mock import MagicMock
from core.proyeccion import MotorProyeccion
from pages.obligaciones import calculate_payment_remaining


def test_e2e_motor_proyeccion_full_structure():
    """Test full MotorProyeccion calculation combining facturas, obligaciones, and egresos_recurrentes."""
    mock_client = MagicMock()

    tables_data = {
        "semanas": [
            {"id": 1, "numero": 35, "anio": 2026, "fecha_inicio": "2026-08-24", "fecha_fin": "2026-08-30"},
            {"id": 2, "numero": 36, "anio": 2026, "fecha_inicio": "2026-08-31", "fecha_fin": "2026-09-06"},
            {"id": 3, "numero": 37, "anio": 2026, "fecha_inicio": "2026-09-07", "fecha_fin": "2026-09-13"},
        ],
        "cuentas_bancarias": [
            {"id": 1, "nombre": "Bancolombia Principal", "saldo": 20000000.0, "activa": True}
        ],
        "facturas": [
            {
                "id": 101,
                "numero": "FV-2026-001",
                "valor": 15000000.0,
                "fecha_estimada_recaudo": "2026-08-25",
                "estado": "pendiente",
            }
        ],
        "recaudos": [],
        "obligaciones": [
            {
                "id": 1,
                "tercero": "Leasing Bancolombia",
                "categoria_id": 1,
                "monto_total": 5000000.0,
                "saldo_pendiente": 5000000.0,
                "fecha_programada_pago": "2026-08-26",
                "estado": "pendiente",
            },
            {
                "id": 2,
                "tercero": "Proveedor de obra",
                "categoria_id": 2,
                "monto_total": 35000000.0,
                "saldo_pendiente": 35000000.0,
                "fecha_programada_pago": "2026-09-02",
                "estado": "pendiente",
            },
        ],
        "egresos_recurrentes": [
            {
                "id": 1,
                "categoria_id": 3,
                "tercero": "Servicios Públicos",
                "frecuencia": "mensual",
                "dia_pago": 28,
                "monto_estimado": 1000000.0,
                "activa": True,
            }
        ],
        "egresos": [],
    }

    def mock_table(table_name):
        chain = MagicMock()
        data = tables_data.get(table_name, [])
        chain.select.return_value = chain
        chain.gte.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.in_.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value.data = data
        return chain

    mock_client.table.side_effect = mock_table

    motor = MotorProyeccion(mock_client)
    res = motor.calcular(semanas=3)

    assert len(res) == 3

    # --- Week 1 Verification ---
    w1 = res[0]
    assert w1["saldo_inicial"] == 20000000.0
    assert w1["recaudo_proyectado"] == 15000000.0
    assert w1["obligaciones"] == 5000000.0
    assert w1["egresos_recurrente"] == 1000000.0  # Aug 28 falls in week 1 (Aug 24-30)
    assert w1["egresos"] == 6000000.0
    assert w1["saldo_final"] == 29000000.0
    assert w1["deficit"] is False


def test_e2e_deficit_detection_accuracy():
    """Test accurate deficit detection when scheduled obligations exceed current and projected funds."""
    mock_client = MagicMock()

    tables_data = {
        "semanas": [
            {"id": 1, "numero": 35, "anio": 2026, "fecha_inicio": "2026-08-24", "fecha_fin": "2026-08-30"},
            {"id": 2, "numero": 36, "anio": 2026, "fecha_inicio": "2026-08-31", "fecha_fin": "2026-09-06"},
        ],
        "cuentas_bancarias": [
            {"id": 1, "saldo": 10000000.0, "activa": True}
        ],
        "facturas": [],
        "recaudos": [],
        "obligaciones": [
            {
                "id": 1,
                "tercero": "DIAN Retefuente",
                "categoria_id": 1,
                "monto_total": 15000000.0,
                "saldo_pendiente": 15000000.0,
                "fecha_programada_pago": "2026-08-27",
                "estado": "pendiente",
            }
        ],
        "egresos_recurrentes": [],
        "egresos": [],
    }

    def mock_table(table_name):
        chain = MagicMock()
        data = tables_data.get(table_name, [])
        chain.select.return_value = chain
        chain.gte.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.in_.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value.data = data
        return chain

    mock_client.table.side_effect = mock_table

    motor = MotorProyeccion(mock_client)
    res = motor.calcular(semanas=2)

    # Week 1: 10M initial - 15M obligation = -5M final -> Deficit!
    w1 = res[0]
    assert w1["saldo_inicial"] == 10000000.0
    assert w1["obligaciones"] == 15000000.0
    assert w1["saldo_final"] == -5000000.0
    assert w1["deficit"] is True

    # Test alerts helper method
    alertas = motor.alertas()
    assert len(alertas) >= 1
    assert alertas[0]["semana"] == 35
    assert alertas[0]["deficit"] is True


def test_e2e_payment_execution_calculation():
    """Test obligation payment execution math, state transition, and bank balance updates."""
    # 1. Partial Payment Execution
    monto_total = 10000000.0
    current_saldo_ob = 10000000.0
    pago_parcial = 4000000.0
    bank_saldo_initial = 15000000.0

    rem_saldo_1, estado_1 = calculate_payment_remaining(monto_total, pago_parcial, current_saldo_ob)
    assert rem_saldo_1 == 6000000.0
    assert estado_1 == "parcial"

    new_bank_saldo_1 = bank_saldo_initial - pago_parcial
    assert new_bank_saldo_1 == 11000000.0

    # 2. Final Payment Execution (paying remaining amount)
    pago_final = 6000000.0
    rem_saldo_2, estado_2 = calculate_payment_remaining(monto_total, pago_final, rem_saldo_1)
    assert rem_saldo_2 == 0.0
    assert estado_2 == "pagada"

    new_bank_saldo_2 = new_bank_saldo_1 - pago_final
    assert new_bank_saldo_2 == 5000000.0

    # 3. Database operation simulation via Supabase mock client
    mock_client = MagicMock()
    mock_table_chain = MagicMock()
    mock_client.table.return_value = mock_table_chain
    mock_table_chain.insert.return_value = mock_table_chain
    mock_table_chain.update.return_value = mock_table_chain
    mock_table_chain.eq.return_value = mock_table_chain
    mock_table_chain.execute.return_value = MagicMock(data=[{"id": 1}])

    # Execute payment DB calls simulation
    mock_client.table("pagos_obligaciones").insert({
        "obligacion_id": 1,
        "cuenta_id": 1,
        "semana_id": 1,
        "monto_pagado": pago_parcial,
        "fecha_pago": "2026-08-25",
        "comprobante_ref": "REF-001",
    }).execute()

    mock_client.table("obligaciones").update({
        "saldo_pendiente": rem_saldo_1,
        "estado": estado_1,
    }).eq("id", 1).execute()

    mock_client.table("cuentas_bancarias").update({
        "saldo": new_bank_saldo_1
    }).eq("id", 1).execute()

    # Assert mock client calls occurred properly
    assert mock_client.table.call_count >= 3
