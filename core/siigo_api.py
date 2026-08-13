"""Cliente de integración nativa con la API de SIIGO Colombia."""
import requests
import logging
from datetime import date, timedelta
from typing import Optional, dict, list

logger = logging.getLogger("pospin-flujo-caja")


class SiigoAPIClient:
    """Cliente HTTP síncrono para interactuar con la API oficial de SIIGO."""

    def __init__(self, username: str, access_key: str, partner_id: str, base_url: str = "https://api.siigo.com"):
        self.base_url = base_url
        self.username = username
        self.access_key = access_key
        self.partner_id = partner_id
        self._token: Optional[str] = None

    def obtener_token(self) -> str:
        """Autentica con SIIGO y almacena el token de acceso en memoria."""
        if self._token:
            return self._token

        url = f"{self.base_url}/auth"
        payload = {
            "username": self.username,
            "access_key": self.access_key
        }
        headers = {"Content-Type": "application/json"}
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            self._token = data["access_token"]
            return self._token
        except Exception as e:
            logger.error(f"Error de autenticación con SIIGO: {e}")
            raise Exception(f"No se pudo conectar a SIIGO: {e}")

    def _get_headers(self) -> dict:
        token = self.obtener_token()
        return {
            "Authorization": f"Bearer {token}",
            "Partner-Id": self.partner_id,
            "Content-Type": "application/json"
        }

    def consultar_facturas_venta(self, dias_atras: int = 90) -> list:
        """Consulta facturas de venta desde SIIGO de los últimos N días."""
        url = f"{self.base_url}/v1/invoices"
        
        # Parámetros de rango de fecha
        fecha_fin = date.today()
        fecha_inicio = fecha_fin - timedelta(days=dias_atras)
        
        params = {
            "date_start": fecha_inicio.isoformat(),
            "date_end": fecha_fin.isoformat(),
            "page_size": 100,
            "page": 1
        }
        
        headers = self._get_headers()
        facturas = []
        
        try:
            while True:
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                if not results:
                    break
                facturas.extend(results)
                
                # Paginación
                total_results = data.get("pagination", {}).get("total_results", 0)
                if len(facturas) >= total_results:
                    break
                params["page"] += 1
                if params["page"] > 20: # Limite de salvaguarda
                    break
            return facturas
        except Exception as e:
            logger.error(f"Error al consultar facturas en SIIGO: {e}")
            raise e

    def consultar_cuentas_por_pagar(self) -> list:
        """Consulta el reporte de cuentas por pagar en SIIGO."""
        url = f"{self.base_url}/v1/accounts-payable"
        params = {
            "page_size": 100,
            "page": 1
        }
        headers = self._get_headers()
        cuentas_pagar = []
        
        try:
            while True:
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                if not results:
                    break
                cuentas_pagar.extend(results)
                
                total_results = data.get("pagination", {}).get("total_results", 0)
                if len(cuentas_pagar) >= total_results:
                    break
                params["page"] += 1
                if params["page"] > 20:
                    break
            return cuentas_pagar
        except Exception as e:
            logger.error(f"Error al consultar cuentas por pagar en SIIGO: {e}")
            raise e


def sincronizar_cartera_siigo(supabase_client, siigo_client: SiigoAPIClient) -> dict:
    """Sincroniza facturas y clientes desde SIIGO a Supabase preservando fechas de recaudo."""
    stats = {"clientes_creados": 0, "facturas_creadas": 0, "facturas_actualizadas": 0}
    
    # 1. Obtener facturas de SIIGO
    facturas_siigo = siigo_client.consultar_facturas_venta(dias_atras=90)
    if not facturas_siigo:
        return stats

    for f_siigo in facturas_siigo:
        customer = f_siigo.get("customer", {})
        customer_nit = customer.get("identification")
        customer_name = customer.get("name", ["Cliente Desconocido"])[0] if isinstance(customer.get("name"), list) else customer.get("name", "Cliente Desconocido")
        
        if not customer_nit:
            continue
            
        # 2. Sincronizar Cliente en Supabase
        cliente_resp = supabase_client.table("clientes").select("id").eq("nombre", customer_name).execute()
        if cliente_resp.data:
            cliente_id = cliente_resp.data[0]["id"]
        else:
            new_client = supabase_client.table("clientes").insert({
                "nombre": customer_name,
                "contacto": f"NIT: {customer_nit}"
            }).execute()
            cliente_id = new_client.data[0]["id"]
            stats["clientes_creados"] += 1

        # 3. Datos de la factura
        prefix = f_siigo.get("prefix") or ""
        number = str(f_siigo.get("number", ""))
        numero_completo = f"{prefix}{number}" if prefix else number
        
        valor = float(f_siigo.get("total", 0.0))
        balance = float(f_siigo.get("due", {}).get("balance", 0.0))
        
        fecha_emision = f_siigo.get("date")
        fecha_vencimiento = f_siigo.get("due", {}).get("date") or fecha_emision

        # Determinar estado
        if balance <= 0:
            estado = "pagada"
        elif balance < valor:
            estado = "parcial"
        else:
            # Si tiene saldo y la fecha vencimiento es pasada
            if date.fromisoformat(fecha_vencimiento) < date.today():
                estado = "vencida"
            else:
                estado = "pendiente"

        # 4. Upsert factura preservando fecha_estimada_recaudo
        factura_resp = supabase_client.table("facturas").select("id, fecha_estimada_recaudo").eq("numero", numero_completo).execute()
        
        if factura_resp.data:
            # Ya existe: actualizar datos financieros y estado, preservar fecha_estimada_recaudo
            supabase_client.table("facturas").update({
                "valor": valor,
                "estado": estado,
                "fecha_vencimiento": fecha_vencimiento
            }).eq("id", factura_resp.data[0]["id"]).execute()
            stats["facturas_actualizadas"] += 1
        else:
            # Nueva: insertar e inicializar fecha_estimada_recaudo = fecha_vencimiento
            supabase_client.table("facturas").insert({
                "cliente_id": cliente_id,
                "numero": numero_completo,
                "fecha_emision": fecha_emision,
                "fecha_vencimiento": fecha_vencimiento,
                "fecha_estimada_recaudo": fecha_vencimiento,
                "valor": valor,
                "estado": estado
            }).execute()
            stats["facturas_creadas"] += 1

    return stats
