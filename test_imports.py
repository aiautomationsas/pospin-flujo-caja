"""Test that all imports work at runtime."""
import sys
sys.path.insert(0, '.')

# Test all imports that pages use
from core.proyeccion import MotorProyeccion
print('OK: core.proyeccion')

from core.importer import parse_excel, import_to_db, register_import
print('OK: core.importer')

from core.models import UserProfile, Cuenta, Cliente, Factura, Semana, SaldoSemanal, Recaudo, CategoriaEgreso, Egreso, Compromiso, Importacion
print('OK: core.models')

from utils.format import fmt_money, fmt_date, semana_label
print('OK: utils.format')

from utils.alerts import detect_deficits, alert_severity
print('OK: utils.alerts')

from utils.export import export_excel, export_pdf
print('OK: utils.export')

# Test format functions
assert fmt_money(1234567) == "$1.234.567", f"Got: {fmt_money(1234567)}"
assert fmt_money(None) == "$0"
assert fmt_date(None) == "-"
assert semana_label(24, 2026) == "Semana 24 (2026)"
print('OK: format functions')

# Test alert functions
test_proyeccion = [
    {"semana": 1, "anio": 2026, "saldo_final": 100, "fecha_inicio": "2026-01-01"},
    {"semana": 2, "anio": 2026, "saldo_final": -50000000, "fecha_inicio": "2026-01-08"},
]
deficits = detect_deficits(test_proyeccion)
assert len(deficits) == 1
assert deficits[0]["semana"] == 2
assert alert_severity(50000000) == "critical"
assert alert_severity(5000000) == "warning"
print('OK: alert functions')

# Test export functions with dummy data
test_proyeccion_full = [
    {"semana": 1, "anio": 2026, "saldo_inicial": 100000, "recaudo": 50000, "egresos": 30000, "saldo_final": 120000},
]
test_saldos = [{"nombre": "Cuenta 1", "banco": "Bancolombia", "numero": "8001", "saldo": 100000}]
test_recaudos = [{"cliente": "Cliente A", "facturas": [{"numero": "F001", "valor": 50000, "pendiente": 25000}], "total_pendiente": 25000}]

excel_buf = export_excel(test_proyeccion_full, test_saldos, test_recaudos)
assert excel_buf is not None
assert len(excel_buf.getvalue()) > 0
print(f'OK: export_excel ({len(excel_buf.getvalue())} bytes)')

pdf_buf = export_pdf(test_proyeccion_full, test_saldos, test_recaudos)
assert pdf_buf is not None
assert len(pdf_buf.getvalue()) > 0
print(f'OK: export_pdf ({len(pdf_buf.getvalue())} bytes)')

print()
print('ALL TESTS PASSED')
