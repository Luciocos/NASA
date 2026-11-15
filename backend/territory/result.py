"""Resultado común de un chequeo territorial. Ver territory/README.md.

Un chequeo cruza el lote con una capa pública (o con lo que declaró el productor) y
devuelve un estado indicativo. No es una auditoría ni un dictamen legal.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class CheckStatus(StrEnum):
    CLEAR = 'CLEAR'  # sin superposición detectada / sin conflicto detectado
    POSSIBLE_CONFLICT = 'POSSIBLE_CONFLICT'  # posible conflicto: revisar
    NO_DATA = 'NO_DATA'  # sin capa, sin fuente verificada o sin declaración


class CheckOrigin(StrEnum):
    OFFICIAL_LAYER = 'OFFICIAL_LAYER'  # capa pública (organismo u OpenStreetMap), no satelital
    DECLARED = 'DECLARED'  # informado por el productor
    VERIFIED = 'VERIFIED'  # observado por satélite


@dataclass
class LayerSource:
    """De dónde sale la capa o la norma. Se muestra siempre junto al resultado."""

    name: str
    publisher: str = ''
    url: str = ''
    date: str = ''  # fecha de la capa o de la norma (AAAA-MM-DD o AAAA)
    license: str = ''


@dataclass
class CheckResult:
    key: str  # 'periurban', 'otbn', 'bpa'
    title: str
    status: CheckStatus
    summary: str  # una o dos frases en lenguaje llano
    origin: CheckOrigin
    sources: list[LayerSource] = field(default_factory=list)
    # Datos propios del chequeo (porcentajes, distancias, geometrías GeoJSON, etc.)
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
