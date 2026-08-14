"""Tests for dashboard export functions and MotorProyeccion obligations support."""
import io
from unittest.mock import MagicMock
from utils.export import export_excel, export_pdf
from core.proyeccion import MotorProyeccion


def test_export_excel_with_obligaciones():
    proyeccion_data = [
        {
            "semana": 35,
            "anio": 2026,
            "saldo_inicial": 10000000.0,
            "recaudo": 5000000.0,
            "egresos_recurrente": 2000000.0,
            "egresos_real": 0.0,
            "obligaciones": 1000000.0,
            "saldo_final": 12000000.0,
        }
    ]
    saldos_cuenta = [
        {"nombre": "Cuenta Corriente", "banco": "Bancolombia", "numero": "123456", "saldo": 10000000.0}
    ]
    recaudo_pendiente = [
        {
            "cliente": "Cliente ABC",
            "facturas": [{"numero": "FAC-001", "valor": 5000000.0, "pendiente": 5000000.0}],
            "total_pendiente": 5000000.0,
        }
    ]
    obligaciones_pendientes = [
        {
            "tercero": "Proveedor XYZ",
            "concepto": "Factura Insumos",
            "monto_total": 1000000.0,
            "saldo_pendiente": 1000000.0,
            "fecha_vencimiento": "2026-09-01",
            "fecha_programada_pago": "2026-08-28",
            "prioridad": "alta",
            "estado": "pendiente",
        }
    ]

    buf = export_excel(proyeccion_data, saldos_cuenta, recaudo_pendiente, obligaciones_pendientes)
    assert isinstance(buf, io.BytesIO)
    content = buf.getvalue()
    assert len(content) > 0


def test_export_pdf_with_obligaciones():
    proyeccion_data = [
        {
            "semana": 35,
            "anio": 2026,
            "saldo_inicial": 10000000.0,
            "recaudo": 5000000.0,
            "egresos_recurrente": 2000000.0,
            "egresos_real": 0.0,
            "obligaciones": 1000000.0,
            "saldo_final": 12000000.0,
        }
    ]
    saldos_cuenta = [
        {"nombre": "Cuenta Corriente", "banco": "Bancolombia", "numero": "123456", "saldo": 10000000.0}
    ]
    recaudo_pendiente = []
    obligaciones_pendientes = [
        {
            "tercero": "Proveedor XYZ",
            "concepto": "Factura Insumos",
            "monto_total": 1000000.0,
            "saldo_pendiente": 1000000.0,
            "fecha_vencimiento": "2026-09-01",
            "fecha_programada_pago": "2026-08-28",
            "prioridad": "alta",
            "estado": "pendiente",
        }
    ]

    buf = export_pdf(proyeccion_data, saldos_cuenta, recaudo_pendiente, obligaciones_pendientes)
    assert isinstance(buf, io.BytesIO)
    content = buf.getvalue()
    assert len(content) > 0


def test_motor_proyeccion_obligaciones_pendientes():
    mock_client = MagicMock()
    mock_client.table().select().in_().order().execute.return_value.data = [
        {
            "id": 1,
            "tercero": "DIAN",
            "concepto": "Retefuente",
            "monto_total": 2500000.0,
            "saldo_pendiente": 2500000.0,
            "estado": "pendiente",
        }
    ]

    motor = MotorProyeccion(mock_client)
    res = motor.obligaciones_pendientes()
    assert len(res) == 1
    assert res[0]["tercero"] == "DIAN"
