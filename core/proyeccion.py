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
                 saldo_inicial, recaudo, egresos, saldo_final, deficit,
                 recaudo_real, recaudo_proyectado, egresos_real, egresos_recurrente,
                 obligaciones, compromisos.
        """
        hoy = date.today()
        semanas_resp = self.client.table("semanas").select("*").gte(
            "fecha_inicio", hoy.isoformat()
        ).order("fecha_inicio").limit(semanas).execute()

        if not semanas_resp or not semanas_resp.data:
            return []

        # 1. Obtener todas las facturas pendientes/parciales para la proyección de recaudos
        facturas_resp = self.client.table("facturas").select(
            "id, valor, fecha_estimada_recaudo, estado"
        ).in_("estado", ["pendiente", "parcial"]).execute()
        
        facturas_pendientes = facturas_resp.data if (facturas_resp and facturas_resp.data) else []
        facturas_map = {}
        for f in facturas_pendientes:
            recaudos_f = self.client.table("recaudos").select("valor").eq("factura_id", f["id"]).execute()
            total_recaudado = sum(float(r["valor"]) for r in recaudos_f.data) if (recaudos_f and recaudos_f.data) else 0.0
            pendiente = float(f["valor"]) - total_recaudado
            if pendiente > 0:
                f_date = f["fecha_estimada_recaudo"]
                if isinstance(f_date, str):
                    f_date = date.fromisoformat(f_date)
                facturas_map[f["id"]] = {
                    "fecha_est": f_date,
                    "pendiente": pendiente
                }

        # 2. Obtener todas las plantillas de egresos recurrentes activas
        recurrentes_resp = self.client.table("egresos_recurrentes").select("*").eq("activa", True).execute()
        recurrentes = recurrentes_resp.data if (recurrentes_resp and recurrentes_resp.data) else []

        # 3. Obtener obligaciones pendientes/parciales (SSOT)
        try:
            obligaciones_resp = self.client.table("obligaciones").select("*").in_("estado", ["pendiente", "parcial"]).execute()
            obligaciones_pendientes = obligaciones_resp.data if (obligaciones_resp and obligaciones_resp.data) else []
        except Exception:
            obligaciones_pendientes = []

        resultado = []
        saldo_acumulado = None
        primera_semana = True

        for sem in semanas_resp.data:
            semana_id = sem["id"]
            fecha_inicio = date.fromisoformat(sem["fecha_inicio"]) if isinstance(sem["fecha_inicio"], str) else sem["fecha_inicio"]
            fecha_fin = date.fromisoformat(sem["fecha_fin"]) if isinstance(sem["fecha_fin"], str) else sem["fecha_fin"]

            # ── SALDO INICIAL ──
            if saldo_acumulado is None:
                saldo_inicial = 0.0
                # Intentar desde cuentas_bancarias
                try:
                    cuentas_resp = self.client.table("cuentas_bancarias").select("saldo").execute()
                    if cuentas_resp and isinstance(cuentas_resp.data, list) and cuentas_resp.data:
                        saldo_inicial = sum(float(c.get("saldo", 0) or 0) for c in cuentas_resp.data if isinstance(c, dict))
                except Exception:
                    saldo_inicial = 0.0

                # Si cuentas_bancarias dio 0 o falló, intentar desde saldos_semanales
                if saldo_inicial == 0.0:
                    try:
                        saldos_resp = self.client.table("saldos_semanales").select("saldo").eq(
                            "semana_id", semana_id
                        ).execute()
                        if saldos_resp and isinstance(saldos_resp.data, list) and saldos_resp.data:
                            saldo_inicial = sum(float(s.get("saldo", 0) or 0) for s in saldos_resp.data if isinstance(s, dict))
                    except Exception:
                        pass
            else:
                saldo_inicial = saldo_acumulado

            # ── RECAUDOS DE LA SEMANA ──
            recaudos_resp = self.client.table("recaudos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            recaudos_reales = sum(
                float(r["valor"]) for r in recaudos_resp.data
            ) if (recaudos_resp and isinstance(recaudos_resp.data, list) and recaudos_resp.data) else 0.0

            recaudos_proyectados = 0.0
            for f_id, f_data in list(facturas_map.items()):
                f_date = f_data["fecha_est"]
                if (fecha_inicio <= f_date <= fecha_fin) or (primera_semana and f_date < fecha_inicio):
                    recaudos_proyectados += f_data["pendiente"]
                    facturas_map.pop(f_id)

            total_recaudo = recaudos_reales + recaudos_proyectados

            # ── OBLIGACIONES DE LA SEMANA (SSOT) ──
            total_obligaciones = 0.0
            obligaciones_cats = set()
            for ob in obligaciones_pendientes:
                f_prog = ob.get("fecha_programada_pago")
                if f_prog:
                    if isinstance(f_prog, str):
                        f_prog = date.fromisoformat(f_prog)
                    if (fecha_inicio <= f_prog <= fecha_fin) or (primera_semana and f_prog < fecha_inicio):
                        monto_ob = float(ob.get("saldo_pendiente") or ob.get("monto_total") or 0.0)
                        total_obligaciones += monto_ob
                        if ob.get("categoria_id") is not None:
                            obligaciones_cats.add(ob["categoria_id"])

            # ── EGRESOS DE LA SEMANA ──
            egresos_resp = self.client.table("egresos").select("valor", "categoria_id").eq(
                "semana_id", semana_id
            ).execute()
            egresos_reales_map = {}
            if egresos_resp and isinstance(egresos_resp.data, list) and egresos_resp.data:
                for e in egresos_resp.data:
                    if isinstance(e, dict) and e.get("categoria_id") is not None:
                        egresos_reales_map[e["categoria_id"]] = float(e.get("valor", 0) or 0)
            total_egresos_reales = sum(egresos_reales_map.values())

            # Egresos proyectados recurrentes (solo si no hay egreso real ni obligación para esa categoría en esta semana)
            total_egresos_recurrentes = 0.0
            for rec in recurrentes:
                cat_id = rec.get("categoria_id")
                if cat_id is None or (cat_id not in egresos_reales_map and cat_id not in obligaciones_cats):
                    if self._evaluar_recurrencia(rec, fecha_inicio, fecha_fin):
                        total_egresos_recurrentes += float(rec.get("monto_estimado", 0) or 0.0)

            total_egresos = total_egresos_reales + total_egresos_recurrentes + total_obligaciones
            saldo_final = saldo_inicial + total_recaudo - total_egresos
            deficit = saldo_final < 0

            resultado.append({
                "semana_id": semana_id,
                "semana": sem["numero"],
                "anio": sem["anio"],
                "fecha_inicio": str(sem["fecha_inicio"]),
                "fecha_fin": str(sem["fecha_fin"]),
                "saldo_inicial": saldo_inicial,
                "recaudo": total_recaudo,
                "recaudo_real": recaudos_reales,
                "recaudo_proyectado": recaudos_proyectados,
                "egresos": total_egresos,
                "egresos_real": total_egresos_reales,
                "egresos_recurrente": total_egresos_recurrentes,
                "obligaciones": total_obligaciones,
                "compromisos": total_obligaciones,
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

    def obligaciones_pendientes(self) -> list[dict]:
        """Retorna lista de obligaciones pendientes o parciales."""
        try:
            resp = self.client.table("obligaciones").select("*").in_("estado", ["pendiente", "parcial"]).order("fecha_programada_pago").execute()
            return resp.data or []
        except Exception:
            return []

