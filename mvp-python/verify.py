#!/usr/bin/env python3
"""Verify flujo_caja.py output against expected values."""
import sys
import os

# Fix CWD
os.chdir("/Users/santiagoandressanchezmontoya")

sys.path.insert(0, "/Users/santiagoandressanchezmontoya/.hermes/vaults/shared/software/proyectos/grupo-pospin-flujo-caja/entregables/flujo-caja-mvp")

import openpyxl

excel_path = "/Users/santiagoandressanchezmontoya/.hermes/vaults/shared/software/proyectos/grupo-pospin-flujo-caja/insumos/flujo-caja-inge10-base.xlsx"

# Import the module
from flujo_caja import parse_bancos, parse_flujo, parse_compromisos, safe_num

wb = openpyxl.load_workbook(excel_path, data_only=True)

bancos = parse_bancos(wb["BANCOS SEMANAL"])
flujo = parse_flujo(wb["FLUJO DE CAJA PROYECTADO"])
compromisos_sheet = None
for name in wb.sheetnames:
    if "COMPROMISOS" in name.upper():
        compromisos_sheet = wb[name]
        break
compromisos = parse_compromisos(compromisos_sheet) if compromisos_sheet else []

# Verify
errors = []

# 1. Banks: Week 1 total should be 10010000
w1 = [b for b in bancos if b["semana"] == 1]
if not w1 or w1[0]["total"] != 10010000:
    errors.append(f"Week 1 bank total: expected 10010000, got {w1[0]['total'] if w1 else 'N/A'}")

# 2. Saldo final week 12 (index for column L = col 12 = index 6 in week_cols)
# week_cols = F(6)..M(13) = indices 0-7
# L = col 12 = index 6
if flujo["saldo_final"][6] != -103590000:
    errors.append(f"Saldo final week 12 (col L): expected -103590000, got {flujo['saldo_final'][6]}")

# 3. Saldo final week 13 (M = col 13 = index 7)
if flujo["saldo_final"][7] != -77640000:
    errors.append(f"Saldo final week 13 (col M): expected -77640000, got {flujo['saldo_final'][7]}")

# 4. SOLLA recaudo: 8000000 + 1500000 = 9500000
solla_facts = [f for f in flujo["facturas"] if f["cliente"] == "SOLLA"]
solla_total = sum(f["valor"] for f in solla_facts)
if solla_total != 9500000:
    errors.append(f"SOLLA total facturas: expected 9500000, got {solla_total}")

# 5. EL TESORO recaudo: 150000000
tesoro_facts = [f for f in flujo["facturas"] if f["cliente"] == "EL TESORO"]
tesoro_total = sum(f["valor"] for f in tesoro_facts)
# Note: EL TESORO has 2 invoices: 150000000 + 6000000 = 156000000
if tesoro_total != 156000000:
    errors.append(f"EL TESORO total facturas: expected 156000000, got {tesoro_total}")

# 6. CONCONCRETO: 500000 + 50000000 = 50500000
concreto_facts = [f for f in flujo["facturas"] if f["cliente"] == "CONCONCRETO"]
concreto_total = sum(f["valor"] for f in concreto_facts)
if concreto_total != 50500000:
    errors.append(f"CONCONCRETO total facturas: expected 50500000, got {concreto_total}")

# 7. BANCOLOMBIA compromiso
if not compromisos or compromisos[0]["tercero"] != "BANCOLOMBIA":
    errors.append(f"BANCOLOMBIA compromiso missing or wrong")
elif compromisos[0]["valor"] != 25000000:
    errors.append(f"BANCOLOMBIA valor: expected 25000000, got {compromisos[0]['valor']}")
elif compromisos[0]["prioridad"] != "Alta":
    errors.append(f"BANCOLOMBIA prioridad: expected Alta, got {compromisos[0]['prioridad']}")

# 8. Negative weeks detected
neg_weeks = [i for i, v in enumerate(flujo["saldo_final"]) if v < 0]
if len(neg_weeks) < 2:
    errors.append(f"Expected at least 2 negative weeks, got {len(neg_weeks)}")

# Report
print("=" * 50)
print("VERIFICATION RESULTS")
print("=" * 50)
print(f"Bancos parsed: {len(bancos)} weeks")
print(f"Flujo semanas: {flujo['semanas']}")
print(f"Flujo saldo_final: {flujo['saldo_final']}")
print(f"Facturas: {len(flujo['facturas'])}")
print(f"  SOLLA: {solla_total}")
print(f"  EL TESORO: {tesoro_total}")
print(f"  CONCONCRETO: {concreto_total}")
print(f"Compromisos: {len(compromisos)}")
print(f"  BANCOLOMBIA: {compromisos[0] if compromisos else 'N/A'}")
print(f"Negative weeks at indices: {neg_weeks}")
print()
if errors:
    print(f"FAILURES ({len(errors)}):")
    for e in errors:
        print(f"  ❌ {e}")
    sys.exit(1)
else:
    print("✅ ALL CHECKS PASSED")
    sys.exit(0)
