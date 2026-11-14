"""Lectura de factors.yaml y score_config.yaml. Ver CLAUDE.md, sección 9.

Este módulo solo lee: nunca escribe ni completa valores. Un factor o peso ausente,
nulo o no validado queda como "sin dato" y el cálculo lo informa.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CARBON_DIR = Path(__file__).resolve().parent
FACTORS_PATH = CARBON_DIR / 'factors.yaml'
SCORE_CONFIG_PATH = CARBON_DIR / 'score_config.yaml'


@dataclass(frozen=True)
class Factor:
    key: str
    value: float | None
    unit: str | None
    source: str | None
    validated: bool

    @property
    def problem(self) -> str | None:
        """Motivo por el que el factor no se puede usar, o None si se puede usar."""
        if self.value is None:
            return 'falta el factor de emisión (sin valor con fuente en factors.yaml)'
        if not self.validated:
            return 'el factor de emisión no está validado (validated: false en factors.yaml)'
        if not self.source:
            return 'el factor de emisión no tiene fuente citada en factors.yaml'
        if not self.unit:
            return 'el factor de emisión no tiene unidad en factors.yaml'
        return None

    def as_dict(self) -> dict[str, Any]:
        return {
            'key': self.key,
            'value': self.value,
            'unit': self.unit,
            'source': self.source,
            'validated': self.validated,
        }


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def parse_factors(raw: dict[str, Any] | None) -> dict[str, Factor]:
    """Convierte el contenido de factors.yaml (ya leído) en factores tipados."""
    factors: dict[str, Factor] = {}
    for key, entry in (raw or {}).items():
        entry = entry if isinstance(entry, dict) else {}
        factors[key] = Factor(
            key=key,
            value=_number(entry.get('value')),
            unit=entry.get('unit') or None,
            source=entry.get('source') or None,
            validated=entry.get('validated') is True,
        )
    return factors


def load_factors(path: Path = FACTORS_PATH) -> dict[str, Factor]:
    with path.open(encoding='utf-8') as file:
        return parse_factors(yaml.safe_load(file))


def parse_weights(raw: dict[str, Any] | None) -> dict[str, float | None]:
    """Pesos del puntaje. Un peso no numérico o negativo se toma como no definido."""
    weights = (raw or {}).get('weights') or {}
    parsed: dict[str, float | None] = {}
    for key, value in weights.items():
        number = _number(value)
        parsed[key] = number if number is not None and number >= 0 else None
    return parsed


def load_weights(path: Path = SCORE_CONFIG_PATH) -> dict[str, float | None]:
    with path.open(encoding='utf-8') as file:
        return parse_weights(yaml.safe_load(file))
