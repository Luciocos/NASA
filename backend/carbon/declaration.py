"""Declaración del productor: campaña, rendimiento e insumos por hectárea.

Lo declarado entra con origen DECLARED y reemplaza al valor de referencia del cultivo.
No toca datos verificados por satélite: solo crea, cambia o borra registros DECLARED.

Cuerpo de POST /api/lots/{id}/declaration/:
    {
      "campaign": "2026/27",          # etiqueta, obligatoria; si no existe se crea
      "crop": "CORN",                 # obligatorio para crear la campaña
      "yield_t_ha": 8.1,              # opcional; null borra el rendimiento declarado
      "inputs": {                     # opcional; cada clave es una categoría
        "FERTILIZER_N": 90,           # kg de N/ha (nutriente)
        "FERTILIZER_P": 20,           # kg de P2O5/ha (nutriente)
        "DIESEL": 35,                 # l/ha
        "PESTICIDE": 2.5,             # kg de principio activo/ha
        "SEED": 25                    # kg/ha
      }
    }
Un valor null en un insumo borra lo declarado y vuelve a usarse la referencia (si existe).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

from carbon.models import InputCategory, InputRecord
from core.origin import Origin
from lots.models import Campaign, Crop, Lot

# Unidad fija por categoría: coincide con la que esperan los factores de factors.yaml
UNITS: dict[str, str] = {
    InputCategory.FERTILIZER_N: 'kg/ha',
    InputCategory.FERTILIZER_P: 'kg/ha',
    InputCategory.DIESEL: 'l/ha',
    InputCategory.PESTICIDE: 'kg/ha',
    InputCategory.SEED: 'kg/ha',
}
# Topes de plausibilidad para detectar errores de tipeo (no son datos agronómicos)
MAX_VALUES: dict[str, float] = {
    'yield_t_ha': 30,
    InputCategory.FERTILIZER_N: 500,
    InputCategory.FERTILIZER_P: 300,
    InputCategory.DIESEL: 300,
    InputCategory.PESTICIDE: 50,
    InputCategory.SEED: 400,
}
CAMPAIGN_LABEL = re.compile(r'^\d{4}/\d{2}$')


class InvalidDeclaration(ValueError):
    def __init__(self, errors: dict[str, list[str]]) -> None:
        super().__init__(errors)
        self.errors = errors


@dataclass
class Declaration:
    campaign: str
    crop: str | None
    yield_t_ha: float | None = None
    has_yield: bool = False
    inputs: dict[str, float | None] = field(default_factory=dict)


def _amount(value: Any, key: str, errors: dict[str, list[str]], label: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        errors.setdefault(label, []).append('Debe ser un número o null.')
        return None
    if value < 0 or value > MAX_VALUES[key]:
        errors.setdefault(label, []).append(f'Debe estar entre 0 y {MAX_VALUES[key]:g}.')
        return None
    return float(value)


def parse_declaration(body: Any) -> Declaration:
    if not isinstance(body, dict):
        raise InvalidDeclaration({'non_field_errors': ['El cuerpo debe ser un objeto JSON.']})
    errors: dict[str, list[str]] = {}
    allowed = {'campaign', 'crop', 'yield_t_ha', 'inputs'}
    for key in sorted(set(body) - allowed):
        errors[key] = ['Campo no admitido.']

    campaign = str(body.get('campaign') or '').strip()
    if not CAMPAIGN_LABEL.match(campaign):
        errors['campaign'] = ['Indicar la campaña con el formato AAAA/AA, por ejemplo 2026/27.']
    crop = body.get('crop')
    if crop is not None and crop not in Crop.values:
        errors['crop'] = [f'Opciones: {", ".join(Crop.values)}.']

    declaration = Declaration(campaign=campaign, crop=crop)
    if 'yield_t_ha' in body:
        declaration.has_yield = True
        declaration.yield_t_ha = _amount(body['yield_t_ha'], 'yield_t_ha', errors, 'yield_t_ha')

    inputs = body.get('inputs', {})
    if not isinstance(inputs, dict):
        errors['inputs'] = ['Debe ser un objeto con categorías de insumo.']
        inputs = {}
    for category, value in inputs.items():
        if category not in UNITS:
            errors[f'inputs.{category}'] = [f'Categoría no admitida. Opciones: {", ".join(UNITS)}.']
            continue
        declaration.inputs[category] = _amount(value, category, errors, f'inputs.{category}')

    if errors:
        raise InvalidDeclaration(errors)
    return declaration


@transaction.atomic
def apply_declaration(lot: Lot, declaration: Declaration) -> Campaign:
    """Guarda la declaración. Devuelve la campaña declarada."""
    campaign = lot.campaigns.filter(label=declaration.campaign).first()
    if campaign is None:
        if declaration.crop is None:
            raise InvalidDeclaration({'crop': ['Indicar el cultivo para crear la campaña.']})
        campaign = Campaign.objects.create(
            lot=lot,
            label=declaration.campaign,
            crop=declaration.crop,
            crop_origin=Origin.DECLARED,
        )
    elif declaration.crop is not None and declaration.crop != campaign.crop:
        # El productor corrige el cultivo: pasa a ser un dato declarado
        campaign.crop = declaration.crop
        campaign.crop_origin = Origin.DECLARED
        campaign.save(update_fields=['crop', 'crop_origin'])

    if declaration.has_yield:
        campaign.yield_t_ha = declaration.yield_t_ha
        campaign.yield_origin = Origin.DECLARED if declaration.yield_t_ha is not None else ''
        campaign.save(update_fields=['yield_t_ha', 'yield_origin'])

    for category, quantity in declaration.inputs.items():
        campaign.inputs.filter(category=category, origin=Origin.DECLARED).delete()
        if quantity is not None:
            InputRecord.objects.create(
                campaign=campaign,
                category=category,
                quantity=quantity,
                unit=UNITS[category],
                origin=Origin.DECLARED,
            )
    return campaign
