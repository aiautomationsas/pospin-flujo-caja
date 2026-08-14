"""Motor de proyección de flujo de caja semanal."""
from datetime import date, timedelta
from decimal import Decimal


class MotorProyeccion:
    """Calcula la proyección de flujo de caja semana a semana."""

    def __init__(self, client):
        self.client = client

    def generar_semanas_futuras(self, n: int = 12):
        """Crea semanas futuras en la BD si no existen, empezando desde la semana ISO actual."""
        today = date.today()
        iso = today.isocalendar()
        anio_actual = iso[0]
        semana_actual = iso[1]

        # Lunes de la semana actual
        monday = today - timedelta(days=today.weekday())

        for i in range(n):
            num = semana_actual + i
            anio = anio_actual
            # Manejar rollover de año
            if num > 52:
                num = num - 52
                anio = anio_actual + 1

            fecha_inicio = monday + timedelta(weeks=i)
            fecha_fin = fecha_inicio + timedelta(days=6)

            # Verificar si ya existe
            existing = self.client.table("semanas").select("id").eq("anio", anio).eq("numero", num).execute()
            if not existing.data:
                self.client.table("semanas").insert({
                    "numero": num,
                    "anio": anio,
                    "fecha_inicio": fecha_inicio.isoformat(),
                    "fecha_fin": fecha_fin.isoformat(),
                }).execute()

    def calcular(self, semanas: int = 12) -> list[dict]:
        """Calcula la proyección de flujo de caja para las próximas N semanas.
        
        Returns: lista de dicts con: semana, anio, fecha_inicio, fecha_fin,
                 saldo_inicial, recaudo, egresos, saldo_final, deficit
        """
        import datetime
        # Obtener semanas ordenadas
        hoy = date.today()
        iso = hoy.isocalendar()
        semanas_resp = self.client.table("semanas").select("*").gte(
            "fecha_inicio", hoy.isoformat()
        ).order("fecha_inicio").limit(semanas).execute()

        if not semanas_resp.data:
            return []

        # 1. Obtener todas las facturas pendientes/parciales para la proyección de recaudos
        facturas_resp = self.client.table("facturas").select(
            "id, valor, fecha_estimada_recaudo, estado"
        ).in_("estado", ["pendiente", "parcial"]).execute()
        
        facturas_pendientes = facturas_resp.data or []
        facturas_map = {}
        for f in facturas_pendientes:
            # Calcular cuánto se ha recaudado ya de esta factura
            recaudos_f = self.client.table("recaudos").select("valor").eq("factura_id", f["id"]).execute()
            total_recaudado = sum(float(r["valor"]) for r in recaudos_f.data) if recaudos_f.data else 0.0
            pendiente = float(f["valor"]) - total_recaudado
            if pendiente > 0:
                facturas_map[f["id"]] = {
                    "fecha_est": date.fromisoformat(f["fecha_estimada_recaudo"]) if isinstance(f["fecha_estimada_recaudo"], str) else f["fecha_estimada_recaudo"],
                    "pendiente": pendiente
                }

        # 2. Obtener todas las plantillas de egresos recurrentes activas
        recurrentes_resp = self.client.table("egresos_recurrentes").select("*").eq("activa", True).execute()
        recurrentes = recurrentes_resp.data or []

        resultado = []
        saldo_acumulado = None
        primera_semana = True
        semana_actual_inicio = date.fromisoformat(semanas_resp.data[0]["fecha_inicio"])

        for sem in semanas_resp.data:
            semana_id = sem["id"]
            fecha_inicio = date.fromisoformat(sem["fecha_inicio"])
            fecha_fin = date.fromisoformat(sem["fecha_fin"])

            # Saldo inicial: suma de saldos bancarios de la semana anterior
            if saldo_acumulado is None:
                saldos_resp = self.client.table("saldos_semanales").select("saldo").eq(
                    "semana_id", semana_id
                ).execute()
                saldo_inicial = sum(
                    float(s["saldo"]) for s in saldos_resp.data
                ) if saldos_resp.data else 0.0
            else:
                saldo_inicial = saldo_acumulado

            # ── RECAUDOS DE LA SEMANA ──
            # A. Recaudos reales registrados para esta semana
            recaudos_resp = self.client.table("recaudos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            recaudos_reales = sum(
                float(r["valor"]) for r in recaudos_resp.data
            ) if recaudos_resp.data else 0.0

            # B. Recaudos proyectados de facturas pendientes que vencen en esta semana
            recaudos_proyectados = 0.0
            for f_id, f_data in list(facturas_map.items()):
                f_date = f_data["fecha_est"]
                # Si es la primera semana, sumar también toda la cartera vencida del pasado
                if (fecha_inicio <= f_date <= fecha_fin) or (primera_semana and f_date < fecha_inicio):
                    recaudos_proyectados += f_data["pendiente"]
                    # Remover para no duplicar en semanas futuras
                    facturas_map.pop(f_id)

            total_recaudo = recaudos_reales + recaudos_proyectados

            # ── EGRESOS DE LA SEMANA ──
            # A. Egresos reales registrados para esta semana
            egresos_resp = self.client.table("egresos").select("valor", "categoria_id").eq(
                "semana_id", semana_id
            ).execute()
            egresos_reales_map = {e["categoria_id"]: float(e["valor"]) for e in egresos_resp.data} if egresos_resp.data else {}
            total_egresos_reales = sum(egresos_reales_map.values())

            # B. Egresos proyectados recurrentes (solo si no hay un egreso real de esa categoría ya registrado)
            total_egresos_recurrentes = 0.0
            for rec in recurrentes:
                if rec["categoria_id"] not in egresos_reales_map:
                    if self._evaluar_recurrencia(rec, fecha_inicio, fecha_fin):
                        total_egresos_recurrentes += float(rec["monto_estimado"])

            # C. Compromisos pendientes en esta semana
            compromisos_resp = self.client.table("compromisos").select("valor").eq(
                "estado", "pendiente"
            ).gte("fecha", sem["fecha_inicio"]).lte("fecha", sem["fecha_fin"]).execute()
            total_compromisos = sum(
                float(c["valor"]) for c in compromisos_resp.data
            ) if compromisos_resp.data else 0.0

            total_egresos = total_egresos_reales + total_egresos_recurrentes + total_compromisos
            saldo_final = saldo_inicial + total_recaudo - total_egresos
            deficit = saldo_final < 0

            resultado.append({
                "semana_id": semana_id,
                "semana": sem["numero"],
                "anio": sem["anio"],
                "fecha_inicio": sem["fecha_inicio"],
                "fecha_fin": sem["fecha_fin"],
                "saldo_inicial": saldo_inicial,
                "recaudo": total_recaudo,
                "recaudo_real": recaudos_reales,
                "recaudo_proyectado": recaudos_proyectados,
                "egresos": total_egresos,
                "egresos_real": total_egresos_reales,
                "egresos_recurrente": total_egresos_recurrentes,
                "compromisos": total_compromisos,
                "saldo_final": saldo_final,
                "deficit": deficit,
            })

            saldo_acumulado = saldo_final
            primera_semana = False

        return resultado

    def _evaluar_recurrencia(self, rec: dict, inicio: date, fin: date) -> bool:
        """Determina si un egreso recurrente cae en la semana actual."""
        frecuencia = rec["frecuencia"]
        dia_pago = rec["dia_pago"]

        if frecuencia == "semanal":
            # Ocurre todas las semanas
            return True

        elif frecuencia == "quincenal":
            # Ocurre típicamente los días 15 y 30
            # Revisar si el día 15 o el día 30/último de mes caen en la semana
            curr = inicio
            while curr <= fin:
                if curr.day == 15:
                    return True
                # Si es el último día del mes
                next_day = curr + timedelta(days=1)
                if next_day.month != curr.month:
                    return True
                curr += timedelta(days=1)
            return False

        elif frecuencia == "mensual":
            # Ocurre una vez al mes, en dia_pago
            curr = inicio
            while curr <= fin:
                if curr.day == dia_pago:
                    return True
                # Manejar meses con menos días que dia_pago (ej. 31 de noviembre o febrero)
                next_day = curr + timedelta(days=1)
                if next_day.month != curr.month and dia_pago > curr.day:
                    return True
                curr += timedelta(days=1)
            return False

        elif frecuencia == "semestral":
            # Ocurre cada 6 meses (ej. mes_inicio y mes_inicio + 6)
            # dia_pago codifica mes y día (ej. 615 para 15 de junio, 1215 para 15 de diciembre)
            mes_inicio = dia_pago // 100
            dia = dia_pago % 100
            mes_segundo = (mes_inicio + 6)
            if mes_segundo > 12:
                mes_segundo -= 12
                
            curr = inicio
            while curr <= fin:
                if curr.day == dia and (curr.month == mes_inicio or curr.month == mes_segundo):
                    return True
                curr += timedelta(days=1)
            return False

        elif frecuencia == "anual":
            # Ocurre una vez al año (dia_pago codifica mes y día, ej. 1215 para 15 de diciembre)
            mes = dia_pago // 100
            dia = dia_pago % 100
            curr = inicio
            while curr <= fin:
                if curr.day == dia and curr.month == mes:
                    return True
                curr += timedelta(days=1)
            return False

        return False

    def guardar_snapshot(self, semana_id: int, recaudo_est: float, egresos_est: float, saldo_est: float):
        """Guarda/congela la estimación proyectada para una semana."""
        return self.client.table("snapshots_proyeccion").upsert({
            "semana_id": semana_id,
            "recaudo_estimado": recaudo_est,
            "egresos_estimado": egresos_est,
            "saldo_final_estimado": saldo_est,
            "congelado_at": date.today().isoformat()
        }).execute()

    def obtener_calibracion(self, limite_semanas: int = 4) -> list[dict]:
        """Compara las estimaciones congeladas históricas contra los resultados reales."""
        snapshots = self.client.table("snapshots_proyeccion").select(
            "*, semanas(*)"
        ).order("congelado_at", desc=True).limit(limite_semanas).execute()

        if not snapshots.data:
            return []

        resultado = []
        for snap in snapshots.data:
            semana = snap["semanas"]
            semana_id = snap["semana_id"]

            # Recaudos reales de esa semana
            recaudos_resp = self.client.table("recaudos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            real_recaudo = sum(float(r["valor"]) for r in recaudos_resp.data) if recaudos_resp.data else 0.0

            # Egresos reales de esa semana
            egresos_resp = self.client.table("egresos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            real_egresos = sum(float(e["valor"]) for e in egresos_resp.data) if egresos_resp.data else 0.0

            # Saldo inicial real de esa semana (debería ser el cierre de la anterior o reportado)
            saldos_resp = self.client.table("saldos_semanales").select("saldo").eq(
                "semana_id", semana_id
            ).execute()
            saldo_inicial_real = sum(float(s["saldo"]) for s in saldos_resp.data) if saldos_resp.data else 0.0
            real_saldo_final = saldo_inicial_real + real_recaudo - real_egresos

            resultado.append({
                "semana": semana["numero"],
                "anio": semana["anio"],
                "fecha_inicio": semana["fecha_inicio"],
                "recaudo_estimado": float(snap["recaudo_estimado"]),
                "recaudo_real": real_recaudo,
                "recaudo_desvio": real_recaudo - float(snap["recaudo_estimado"]),
                "egresos_estimado": float(snap["egresos_estimado"]),
                "egresos_real": real_egresos,
                "egresos_desvio": real_egresos - float(snap["egresos_estimado"]),
                "saldo_estimado": float(snap["saldo_final_estimado"]),
                "saldo_real": real_saldo_final,
                "saldo_desvio": real_saldo_final - float(snap["saldo_final_estimado"]),
            })

        return resultado

    def saldo_por_cuenta(self, semana_id: int) -> list[dict]:
        """Retorna saldo por cuenta para una semana dada."""
        resp = self.client.table("saldos_semanales").select(
            "saldo",
            "cuenta_id",
            "cuentas(nombre, banco, numero)",
        ).eq("semana_id", semana_id).execute()

        if not resp.data:
            return []

        return [
            {
                "cuenta_id": r["cuenta_id"],
                "nombre": r.get("cuentas", {}).get("nombre", "N/A") if isinstance(r.get("cuentas"), dict) else "N/A",
                "banco": r.get("cuentas", {}).get("banco", "N/A") if isinstance(r.get("cuentas"), dict) else "N/A",
                "numero": r.get("cuentas", {}).get("numero", "N/A") if isinstance(r.get("cuentas"), dict) else "N/A",
                "saldo": float(r["saldo"]),
            }
            for r in resp.data
        ]

    def recaudo_pendiente(self) -> list[dict]:
        """Retorna recaudo pendiente agrupado por cliente."""
        # Obtener facturas pendientes/parciales
        facturas_resp = self.client.table("facturas").select(
            "id,numero,valor,estado",
            "clientes(nombre)",
            "recaudos(valor)",
        ).in_("estado", ["pendiente", "parcial"]).execute()

        if not facturas_resp.data:
            return []

        # Agrupar por cliente
        clientes_map: dict[str, dict] = {}
        for f in facturas_resp.data:
            cliente_info = f.get("clientes", {})
            if isinstance(cliente_info, dict):
                cliente_nombre = cliente_info.get("nombre", "Desconocido")
            else:
                cliente_nombre = "Desconocido"

            if cliente_nombre not in clientes_map:
                clientes_map[cliente_nombre] = {"cliente": cliente_nombre, "facturas": [], "total_pendiente": 0.0}

            valor = float(f["valor"])
            recaudos = f.get("recaudos", []) or []
            total_recaudado = sum(float(r["valor"]) for r in recaudos) if isinstance(recaudos, list) else 0.0
            pendiente = valor - total_recaudado

            clientes_map[cliente_nombre]["facturas"].append({
                "numero": f["numero"],
                "valor": valor,
                "pendiente": max(pendiente, 0),
            })
            clientes_map[cliente_nombre]["total_pendiente"] += max(pendiente, 0)

        return list(clientes_map.values())

    def alertas(self) -> list[dict]:
        """Retorna semanas donde el saldo_final es negativo."""
        proyeccion = self.calcular(semanas=12)
        return [p for p in proyeccion if p["deficit"]]
