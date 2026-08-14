from unittest.mock import MagicMock
from datetime import date
from core.proyeccion import MotorProyeccion

def test_motor_proyeccion_calculo_ssot():
    mock_client = MagicMock()
    
    # Mock semanas response
    mock_client.table().select().gte().order().limit().execute.return_value.data = [
        {"id": 1, "numero": 35, "anio": 2026, "fecha_inicio": "2026-08-24", "fecha_fin": "2026-08-30"},
        {"id": 2, "numero": 36, "anio": 2026, "fecha_inicio": "2026-08-31", "fecha_fin": "2026-09-06"}
    ]
    
    # Mock cuentas bancarias initial balances
    mock_client.table().select().eq().execute.return_value.data = [
        {"id": 1, "saldo": 10000000.0}
    ]
    
    # Mock facturas, egresos_recurrentes, obligaciones, etc.
    mock_client.table().select().in_().execute.return_value.data = []
    mock_client.table().select().eq().execute.return_value.data = []
    
    motor = MotorProyeccion(mock_client)
    res = motor.calcular(semanas=2)
    
    assert len(res) == 2
    assert "obligaciones" in res[0]
    assert "recaudo_proyectado" in res[0]

def test_motor_proyeccion_obligaciones_y_cuentas():
    mock_client = MagicMock()

    # Table mocks builder helper
    tables_data = {
        "semanas": [
            {"id": 1, "numero": 35, "anio": 2026, "fecha_inicio": "2026-08-24", "fecha_fin": "2026-08-30"},
            {"id": 2, "numero": 36, "anio": 2026, "fecha_inicio": "2026-08-31", "fecha_fin": "2026-09-06"}
        ],
        "cuentas_bancarias": [
            {"id": 1, "saldo": 15000000.0, "activa": True},
            {"id": 2, "saldo": 5000000.0, "activa": True}
        ],
        "facturas": [],
        "egresos_recurrentes": [],
        "obligaciones": [
            {
                "id": 10,
                "tercero": "Proveedor DIAN",
                "categoria_id": 1,
                "saldo_pendiente": 3000000.0,
                "fecha_programada_pago": "2026-08-26",
                "estado": "pendiente"
            },
            {
                "id": 11,
                "tercero": "Arriendo Sede",
                "categoria_id": 2,
                "saldo_pendiente": 2000000.0,
                "fecha_programada_pago": "2026-09-02",
                "estado": "parcial"
            }
        ],
        "recaudos": [],
        "egresos": []
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

    assert len(res) == 2
    # Week 1 initial balance should be 20,000,000 from sum of cuentas_bancarias
    assert res[0]["saldo_inicial"] == 20000000.0
    # Week 1 obligations: 3,000,000 scheduled for 2026-08-26
    assert res[0]["obligaciones"] == 3000000.0
    # Week 1 final balance: 20M - 3M = 17M
    assert res[0]["saldo_final"] == 17000000.0

    # Week 2 initial balance: 17M
    assert res[1]["saldo_inicial"] == 17000000.0
    # Week 2 obligations: 2,000,000 scheduled for 2026-09-02
    assert res[1]["obligaciones"] == 2000000.0
    # Week 2 final balance: 17M - 2M = 15M
    assert res[1]["saldo_final"] == 15000000.0
