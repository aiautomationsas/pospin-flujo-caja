"""Python dataclasses matching the database schema."""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


@dataclass
class UserProfile:
    id: str
    email: str
    full_name: str = ""
    role: str = "viewer"
    created_at: Optional[datetime] = None


@dataclass
class Cuenta:
    id: Optional[int] = None
    nombre: str = ""
    banco: str = ""
    numero: str = ""
    activa: bool = True
    created_at: Optional[datetime] = None


@dataclass
class Cliente:
    id: Optional[int] = None
    nombre: str = ""
    contacto: Optional[str] = None
    activo: bool = True
    created_at: Optional[datetime] = None


@dataclass
class Factura:
    id: Optional[int] = None
    cliente_id: Optional[int] = None
    numero: str = ""
    fecha_emision: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    valor: Decimal = Decimal("0")
    estado: str = "pendiente"
    created_at: Optional[datetime] = None


@dataclass
class Semana:
    id: Optional[int] = None
    numero: int = 0
    anio: int = 0
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None


@dataclass
class SaldoSemanal:
    id: Optional[int] = None
    semana_id: Optional[int] = None
    cuenta_id: Optional[int] = None
    saldo: Decimal = Decimal("0")


@dataclass
class Recaudo:
    id: Optional[int] = None
    semana_id: Optional[int] = None
    factura_id: Optional[int] = None
    valor: Decimal = Decimal("0")
    fecha: Optional[date] = None
    created_at: Optional[datetime] = None


@dataclass
class CategoriaEgreso:
    id: Optional[int] = None
    nombre: str = ""
    tipo: str = "terceros"
    activa: bool = True


@dataclass
class Egreso:
    id: Optional[int] = None
    semana_id: Optional[int] = None
    categoria_id: Optional[int] = None
    valor: Decimal = Decimal("0")
    descripcion: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class Compromiso:
    id: Optional[int] = None
    tercero: str = ""
    descripcion: Optional[str] = None
    fecha: Optional[date] = None
    valor: Decimal = Decimal("0")
    prioridad: str = "media"
    estado: str = "pendiente"
    created_at: Optional[datetime] = None


@dataclass
class Importacion:
    id: Optional[int] = None
    archivo: str = ""
    fecha: Optional[datetime] = None
    hojas: Optional[str] = None
    registros: int = 0
    exitosa: bool = True
