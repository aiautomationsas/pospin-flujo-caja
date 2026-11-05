#!/usr/bin/env python3
"""
Flujo de Caja Proyectado — Grupo Pospin
Lee un archivo Excel y genera un reporte en terminal con proyección semanal.
"""
import sys
from datetime import datetime
from pathlib import Path

import openpyxl
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()


def fmt_money(val):
    """Formatea un valor monetario en millones con separadores."""
    if val is None or val == 0:
        return "-"
    return f"{val:,.0f}"


def safe_num(val):
    """Convierte un valor de celda a número, retornando 0 si es None."""
    if val is None:
        return 0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0


def parse_bancos(ws):
    """Extrae saldos bancarios semanales. Retorna lista de dicts."""
    rows = []
    for row_num in range(3, 55):  # filas 3-54 = semanas 1-52
        semana = ws.cell(row=row_num, column=1).value
        if semana is None:
            continue
        cta1 = safe_num(ws.cell(row=row_num, column=2).value)
        cta2 = safe_num(ws.cell(row=row_num, column=3).value)
        cta3 = safe_num(ws.cell(row=row_num, column=4).value)
        total = safe_num(ws.cell(row=row_num, column=10).value)
        rows.append({
            "semana": int(semana),
            "cta_8001": cta1,
            "cta_8022": cta2,
            "cta_8023": cta3,
            "total": total,
        })
    return rows


def parse_flujo(ws):
    """Extrae datos del flujo de caja proyectado. Columnas F-M = semanas."""
    # Columnas de datos: F(6) a M(13) = 8 columnas
    week_cols = list(range(6, 14))  # columns F=6 through M=13

    # Números de semana (fila 4)
    semanas = []
    for col in week_cols:
        val = ws.cell(row=4, column=col).value
        semanas.append(val if val else "?")

    # Fechas (fila 3)
    fechas = []
    for col in week_cols:
        val = ws.cell(row=3, column=col).value
        if isinstance(val, datetime):
            fechas.append(val.strftime("%Y-%m-%d"))
        else:
            fechas.append(str(val) if val else "-")

    # Labels de proyección/real (fila 2)
    labels = []
    for col in week_cols:
        val = ws.cell(row=2, column=col).value
        labels.append(str(val) if val else "")

    # Saldo intermedio (fila 7)
    saldo_intermedio = [safe_num(ws.cell(row=7, column=c).value) for c in week_cols]

    # Recaudo total (fila 9)
    recaudo = [safe_num(ws.cell(row=9, column=c).value) for c in week_cols]

    # Facturas de clientes (filas 11-22)
    facturas = []
    for row_num in range(11, 23):
        cliente = ws.cell(row=row_num, column=1).value
        factura = ws.cell(row=row_num, column=2).value
        fecha_venc = ws.cell(row=row_num, column=3).value
        valor = safe_num(ws.cell(row=row_num, column=4).value)
        if not cliente and not factura:
            continue
        # Recaudo por semana (columnas F-M)
        recaudo_semanal = [safe_num(ws.cell(row=row_num, column=c).value) for c in week_cols]
        if cliente:
            facturas.append({
                "cliente": str(cliente).strip(),
                "factura": str(factura) if factura else "",
                "fecha_venc": fecha_venc,
                "valor": valor,
                "recaudo_semanal": recaudo_semanal,
            })

    # Total recaudo (fila 24)
    total_recaudo = [safe_num(ws.cell(row=24, column=c).value) for c in week_cols]

    # Categorías de egresos (filas 27-48)
    egresos_cats = []
    for row_num in range(27, 49):
        cat = ws.cell(row=row_num, column=1).value
        if not cat:
            continue
        vals = [safe_num(ws.cell(row=row_num, column=c).value) for c in week_cols]
        if any(v > 0 for v in vals):
            egresos_cats.append({"categoria": str(cat).strip(), "valores": vals})

    # Totales
    total_terceros = [safe_num(ws.cell(row=49, column=c).value) for c in week_cols]
    total_socios = [safe_num(ws.cell(row=53, column=c).value) for c in week_cols]
    total_financieros = [safe_num(ws.cell(row=64, column=c).value) for c in week_cols]
    total_egresos = [safe_num(ws.cell(row=66, column=c).value) for c in week_cols]
    efecto_semana = [safe_num(ws.cell(row=68, column=c).value) for c in week_cols]
    saldo_final = [safe_num(ws.cell(row=70, column=c).value) for c in week_cols]

    return {
        "semanas": semanas,
        "fechas": fechas,
        "labels": labels,
        "saldo_intermedio": saldo_intermedio,
        "recaudo": recaudo,
        "facturas": facturas,
        "total_recaudo": total_recaudo,
        "egresos_cats": egresos_cats,
        "total_terceros": total_terceros,
        "total_socios": total_socios,
        "total_financieros": total_financieros,
        "total_egresos": total_egresos,
        "efecto_semana": efecto_semana,
        "saldo_final": saldo_final,
    }


def parse_compromisos(ws):
    """Extrae compromisos especiales. Columnas B-E, desde fila 3."""
    rows = []
    for row_num in range(3, 15):
        tercero = ws.cell(row=row_num, column=2).value
        if not tercero:
            continue
        fecha = ws.cell(row=row_num, column=3).value
        valor = safe_num(ws.cell(row=row_num, column=4).value)
        prioridad = ws.cell(row=row_num, column=5).value
        rows.append({
            "tercero": str(tercero).strip(),
            "fecha": fecha,
            "valor": valor,
            "prioridad": str(prioridad).strip() if prioridad else "-",
        })
    return rows


def render_report(bancos, flujo, compromisos):
    """Genera el reporte completo en terminal usando rich."""
    console.print()
    console.print(Panel(
        "[bold white]GRUPO POSPIN[/bold white]\n"
        "[cyan]Flujo de Caja Proyectado — Proyección Semanal[/cyan]\n"
        f"[dim]Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}[/dim]",
        title="💰 REPORTE FINANCIERO",
        border_style="blue",
        expand=True,
    ))

    # ── Sección 1: Saldos Bancarios ──
    console.print()
    t1 = Table(title="📊 Sección 1: Saldos Bancarios por Semana", show_lines=True)
    t1.add_column("Semana", justify="center", style="bold")
    t1.add_column("Cta 8001", justify="right")
    t1.add_column("Cta 8022", justify="right")
    t1.add_column("Cta 8023", justify="right")
    t1.add_column("TOTAL", justify="right", style="bold")

    # Mostrar solo semanas con datos
    for r in bancos:
        if r["total"] > 0:
            t1.add_row(
                str(r["semana"]),
                fmt_money(r["cta_8001"]),
                fmt_money(r["cta_8022"]),
                fmt_money(r["cta_8023"]),
                fmt_money(r["total"]),
            )
    console.print(t1)

    # ── Sección 2: Flujo de Caja Proyectado ──
    console.print()
    semanas = flujo["semanas"]
    n_weeks = len(semanas)

    t2 = Table(title="📈 Sección 2: Flujo de Caja Proyectado", show_lines=True)
    t2.add_column("Concepto", style="bold", min_width=20)
    for i in range(n_weeks):
        label = f"Sem {semanas[i]}"
        if flujo["labels"][i] == "REAL":
            label += "\n(Real)"
        else:
            label += "\n(Proy)"
        t2.add_column(label, justify="right", min_width=14)

    # Saldo intermedio (fila 7 = saldo inicial de la semana)
    t2.add_row(
        "Saldo Inicial",
        *[fmt_money(v) for v in flujo["saldo_intermedio"]],
        style="cyan",
    )
    # Recaudo
    t2.add_row(
        "Recaudo",
        *[fmt_money(v) for v in flujo["total_recaudo"]],
        style="green",
    )
    # Total egresos
    t2.add_row(
        "Total Egresos",
        *[fmt_money(v) for v in flujo["total_egresos"]],
        style="red",
    )
    # Efecto semana
    t2.add_row(
        "Efecto Semana",
        *[fmt_money(v) for v in flujo["efecto_semana"]],
    )
    # Saldo final
    saldo_styles = []
    saldo_cells = []
    for v in flujo["saldo_final"]:
        if v < 0:
            saldo_cells.append(f"[bold red]{fmt_money(v)}[/bold red]")
        else:
            saldo_cells.append(f"[bold green]{fmt_money(v)}[/bold green]")

    t2.add_row("Saldo Final", *saldo_cells)
    console.print(t2)

    # ── Sección 3: Recaudo por Cliente ──
    console.print()
    t3 = Table(title="🧾 Sección 3: Recaudo por Cliente", show_lines=True)
    t3.add_column("Cliente", style="bold")
    t3.add_column("Factura")
    t3.add_column("Valor Factura", justify="right")
    t3.add_column("Recaudado", justify="right", style="green")
    t3.add_column("Pendiente", justify="right", style="yellow")

    # Agrupar por cliente
    clientes = {}
    for f in flujo["facturas"]:
        cliente = f["cliente"]
        if cliente not in clientes:
            clientes[cliente] = []
        clientes[cliente].append(f)

    for cliente, facts in clientes.items():
        total_recaudado = 0
        for f in facts:
            recaudado = sum(f["recaudo_semanal"])
            # Evitar doble conteo E/F (misma semana proy vs real)
            # Si tanto E como F tienen el mismo valor, contar solo una vez
            if f["recaudo_semanal"][0] > 0 and f["recaudo_semanal"][1] > 0:
                if f["recaudo_semanal"][0] == f["recaudo_semanal"][1]:
                    recaudado = recaudado - f["recaudo_semanal"][0]
            total_recaudado += recaudado
            pendiente = f["valor"] - recaudado
            fecha_str = ""
            if isinstance(f["fecha_venc"], datetime):
                fecha_str = f["fecha_venc"].strftime("%Y-%m-%d")
            t3.add_row(
                cliente,
                f"{f['factura']} ({fecha_str})",
                fmt_money(f["valor"]),
                fmt_money(recaudado),
                fmt_money(pendiente) if pendiente > 0 else "-",
            )
        # Fila de total por cliente
        total_valor = sum(f["valor"] for f in facts)
        t3.add_row(
            f"[bold]{cliente} (Total)[/bold]",
            "",
            f"[bold]{fmt_money(total_valor)}[/bold]",
            f"[bold green]{fmt_money(total_recaudado)}[/bold green]",
            f"[bold yellow]{fmt_money(total_valor - total_recaudado)}[/bold yellow]",
        )
    console.print(t3)

    # ── Sección 4: Compromisos Especiales ──
    console.print()
    t4 = Table(title="📋 Sección 4: Compromisos Especiales", show_lines=True)
    t4.add_column("Tercero", style="bold")
    t4.add_column("Fecha")
    t4.add_column("Valor", justify="right")
    t4.add_column("Prioridad", justify="center")

    for c in compromisos:
        fecha_str = ""
        if isinstance(c["fecha"], datetime):
            fecha_str = c["fecha"].strftime("%Y-%m-%d")
        pri_style = "bold red" if c["prioridad"].lower() == "alta" else "yellow"
        t4.add_row(
            c["tercero"],
            fecha_str,
            fmt_money(c["valor"]),
            f"[{pri_style}]{c['prioridad']}[/{pri_style}]",
        )
    console.print(t4)

    # ── Sección 5: ALERTAS ──
    console.print()
    alertas = []
    for i in range(n_weeks):
        if flujo["saldo_final"][i] < 0:
            alertas.append({
                "semana": semanas[i],
                "fecha": flujo["fechas"][i],
                "saldo": flujo["saldo_final"][i],
                "deficit": abs(flujo["saldo_final"][i]),
            })

    if alertas:
        alerta_text = Text()
        alerta_text.append("⚠️  SEMANAS CON SALDO NEGATIVO DETECTADO\n\n", style="bold red")
        for a in alertas:
            alerta_text.append(f"  • Semana {a['semana']}", style="bold")
            alerta_text.append(f" ({a['fecha']}): ", style="dim")
            alerta_text.append(f"Déficit de ${fmt_money(a['deficit'])}\n", style="red")
        alerta_text.append(
            f"\n  Total semanas en déficit: {len(alertas)} de {n_weeks}\n",
            style="yellow",
        )
        alerta_text.append(
            "  Acción requerida: Revisar programación de pagos y acelerar recaudo.\n",
            style="italic",
        )
        console.print(Panel(alerta_text, title="🚨 ALERTAS", border_style="red", expand=True))
    else:
        console.print(Panel(
            "[green]✅ No se detectaron semanas con saldo negativo.[/green]",
            title="🚨 ALERTAS",
            border_style="green",
        ))

    console.print()


def main():
    if len(sys.argv) < 2:
        console.print("[red]Error:[/red] Debe proporcionar la ruta al archivo Excel.")
        console.print("Uso: python flujo_caja.py <ruta_al_excel.xlsx>")
        sys.exit(1)

    excel_path = Path(sys.argv[1])
    if not excel_path.exists():
        console.print(f"[red]Error:[/red] No se encontró el archivo: {excel_path}")
        sys.exit(1)

    console.print(f"[dim]Leyendo: {excel_path}[/dim]")
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)

    # Verificar hojas requeridas
    required = ["BANCOS SEMANAL", "FLUJO DE CAJA PROYECTADO"]
    for name in required:
        if name not in wb.sheetnames:
            console.print(f"[red]Error:[/red] Hoja requerida no encontrada: '{name}'")
            console.print(f"Hojas disponibles: {wb.sheetnames}")
            sys.exit(1)

    # Parsear datos
    bancos = parse_bancos(wb["BANCOS SEMANAL"])
    flujo = parse_flujo(wb["FLUJO DE CAJA PROYECTADO"])

    # Compromisos (nombre con espacio al final)
    compromisos_sheet = None
    for name in wb.sheetnames:
        if "COMPROMISOS" in name.upper():
            compromisos_sheet = wb[name]
            break
    compromisos = parse_compromisos(compromisos_sheet) if compromisos_sheet else []

    # Generar reporte
    render_report(bancos, flujo, compromisos)


if __name__ == "__main__":
    main()
