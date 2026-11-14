"""Valores de referencia por cultivo (reference_values.yaml).

No son datos del lote ni observaciones satelitales. Completan un dato solo cuando el lote
no lo tiene, con origen ESTIMATED y la fuente en el campo `reference`, para que la
interfaz los muestre como "valor de referencia". Un dato declarado o verificado del lote
siempre tiene prioridad: la referencia nunca lo pisa.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import yaml

from carbon.data import CampaignData, InputData, LotData
from core.origin import Origin

REFERENCE_PATH = Path(__file__).resolve().parent / 'reference_values.yaml'


@dataclass(frozen=True)
class ReferenceValue:
    value: float
    unit: str
    source: str


@dataclass(frozen=True)
class References:
    # cultivo -> rendimiento de referencia (t/ha)
    yields: dict[str, ReferenceValue]
    # categoría de insumo -> cultivo -> dosis de referencia por ha
    inputs: dict[str, dict[str, ReferenceValue]]


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
        return None
    return float(value)


def parse_references(raw: dict[str, Any] | None) -> References:
    raw = raw or {}
    yields_raw = raw.get('yield_t_ha') or {}
    yield_source = (yields_raw.get('source') or '').strip()
    yields = {
        crop: ReferenceValue(number, 't/ha', yield_source)
        for crop, value in (yields_raw.get('values') or {}).items()
        if (number := _number(value)) is not None and yield_source
    }
    inputs: dict[str, dict[str, ReferenceValue]] = {}
    for category, entry in (raw.get('inputs') or {}).items():
        source = (entry.get('source') or '').strip()
        unit = (entry.get('unit') or '').strip()
        if not source or not unit:
            continue  # sin fuente o sin unidad no se usa
        inputs[category] = {
            crop: ReferenceValue(number, unit, source)
            for crop, value in (entry.get('values') or {}).items()
            if (number := _number(value)) is not None
        }
    return References(yields=yields, inputs=inputs)


def load_references(path: Path = REFERENCE_PATH) -> References:
    with path.open(encoding='utf-8') as file:
        return parse_references(yaml.safe_load(file))


def _complete_campaign(campaign: CampaignData, refs: References) -> CampaignData:
    changes: dict[str, Any] = {}
    reference_yield = refs.yields.get(campaign.crop)
    if campaign.yield_t_ha is None and reference_yield:
        changes |= {
            'yield_t_ha': reference_yield.value,
            'yield_origin': Origin.ESTIMATED,
            'yield_reference': reference_yield.source,
        }
    present = {record.category for record in campaign.inputs}
    added = tuple(
        InputData(
            category=category,
            quantity=by_crop[campaign.crop].value,
            unit=by_crop[campaign.crop].unit,
            origin=Origin.ESTIMATED,
            reference=by_crop[campaign.crop].source,
        )
        for category, by_crop in refs.inputs.items()
        if category not in present and campaign.crop in by_crop
    )
    if added:
        changes['inputs'] = campaign.inputs + added
    return replace(campaign, **changes) if changes else campaign


def with_references(lot: LotData, refs: References | None = None) -> LotData:
    """Copia del lote con los datos faltantes completados por valores de referencia."""
    refs = refs if refs is not None else load_references()
    return replace(lot, campaigns=tuple(_complete_campaign(c, refs) for c in lot.campaigns))
