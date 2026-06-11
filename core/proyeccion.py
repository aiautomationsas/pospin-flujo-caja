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
        # Obtener semanas ordenadas
        hoy = date.today()
        iso = hoy.isocalendar()
        semanas_resp = self.client.table("semanas").select("*").gte(
            "fecha_inicio", hoy.isoformat()
        ).order("fecha_inicio").limit(semanas).execute()

        if not semanas_resp.data:
            return []

        resultado = []
        saldo_acumulado = None

        for sem in semanas_resp.data:
            semana_id = sem["id"]

            # Saldo inicial: suma de saldos bancarios de la semana anterior
            # Para la primera semana, usar saldos de esa misma semana como inicial
            if saldo_acumulado is None:
                saldos_resp = self.client.table("saldos_semanales").select("saldo").eq(
                    "semana_id", semana_id
                ).execute()
                saldo_inicial = sum(
                    float(s["saldo"]) for s in saldos_resp.data
                ) if saldos_resp.data else 0.0
            else:
                saldo_inicial = saldo_acumulado

            # Recaudos de la semana
            recaudos_resp = self.client.table("recaudos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            total_recaudo = sum(
                float(r["valor"]) for r in recaudos_resp.data
            ) if recaudos_resp.data else 0.0

            # Egresos de la semana
            egresos_resp = self.client.table("egresos").select("valor").eq(
                "semana_id", semana_id
            ).execute()
            total_egresos = sum(
                float(e["valor"]) for e in egresos_resp.data
            ) if egresos_resp.data else 0.0

            # Compromisos pendientes en esta semana
            compromisos_resp = self.client.table("compromisos").select("valor").eq(
                "estado", "pendiente"
            ).gte("fecha", sem["fecha_inicio"]).lte("fecha", sem["fecha_fin"]).execute()
            total_compromisos = sum(
                float(c["valor"]) for c in compromisos_resp.data
            ) if compromisos_resp.data else 0.0

            total_egresos_con_compromisos = total_egresos + total_compromisos
            saldo_final = saldo_inicial + total_recaudo - total_egresos_con_compromisos
            deficit = saldo_final < 0

            resultado.append({
                "semana_id": semana_id,
                "semana": sem["numero"],
                "anio": sem["anio"],
                "fecha_inicio": sem["fecha_inicio"],
                "fecha_fin": sem["fecha_fin"],
                "saldo_inicial": saldo_inicial,
                "recaudo": total_recaudo,
                "egresos": total_egresos_con_compromisos,
                "saldo_final": saldo_final,
                "deficit": deficit,
            })

            saldo_acumulado = saldo_final

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
