from datetime import date
from decimal import Decimal
from core.models import Obligacion, PagoObligacion, Cuenta

def test_obligacion_initialization():
    ob = Obligacion(
        tercero="Proveedor ABC",
        concepto="Factura de insumos",
        monto_total=Decimal("5000000.00"),
        saldo_pendiente=Decimal("5000000.00"),
        fecha_vencimiento=date(2026, 9, 1),
        fecha_programada_pago=date(2026, 9, 1),
        prioridad="alta",
        estado="pendiente"
    )
    assert ob.tercero == "Proveedor ABC"
    assert ob.saldo_pendiente == Decimal("5000000.00")
    assert ob.estado == "pendiente"

def test_pago_obligacion_model():
    pago = PagoObligacion(
        obligacion_id=1,
        cuenta_id=2,
        semana_id=10,
        monto_pagado=Decimal("2000000.00"),
        fecha_pago=date(2026, 9, 1)
    )
    assert pago.monto_pagado == Decimal("2000000.00")
    assert pago.cuenta_id == 2
