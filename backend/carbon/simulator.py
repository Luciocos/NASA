"""Simulador de mejoras. Ver CLAUDE.md, sección 9.

Recibe cambios hipotéticos y devuelve huella y puntaje antes y después.
No persiste nada: trabaja sobre una copia en memoria de los datos del lote (LotData).

Cambios admitidos:
- cover_crop (bool): true agrega un cultivo de cobertura hipotético si el lote no tiene
  ninguno; false quita los cultivos de cobertura de la copia.
- campaign (id o etiqueta, opcional): campaña para la huella. Sin valor, la última.
"""

from __future__ import annotations

import datetime
from dataclasses import replace
from typing import Any

from carbon.config import Factor
from carbon.data import EventData, LotData
from carbon.footprint import compute_footprint
from carbon.score import compute_score
from core.origin import Origin
from events.models import EventType

ALLOWED_CHANGES = {'cover_crop'}
NOT_PERSISTED_MESSAGE = 'Simulación: no modifica los datos del lote.'
COVER_CROP_FOOTPRINT_NOTE = (
    'El cultivo de cobertura no cambia ningún componente de la huella en este modelo: su '
    'posible efecto sobre el carbono del suelo no está modelado porque no hay un factor '
    'con fuente cargado.'
)


class InvalidChanges(ValueError):
    def __init__(self, errors: dict[str, list[str]]) -> None:
        super().__init__(errors)
        self.errors = errors


def validate_changes(body: Any) -> dict[str, Any]:
    """Valida el cuerpo del POST. Levanta InvalidChanges con los errores por campo."""
    if not isinstance(body, dict):
        raise InvalidChanges({'non_field_errors': ['El cuerpo debe ser un objeto JSON.']})
    errors: dict[str, list[str]] = {}
    for key in sorted(set(body) - ALLOWED_CHANGES - {'campaign'}):
        errors[key] = [f'Cambio no admitido. Opciones: {", ".join(sorted(ALLOWED_CHANGES))}.']
    if 'cover_crop' in body and not isinstance(body['cover_crop'], bool):
        errors['cover_crop'] = ['Debe ser true o false.']
    if not set(body) & ALLOWED_CHANGES and not errors:
        errors['non_field_errors'] = [
            'Indicar al menos un cambio, por ejemplo {"cover_crop": true}.'
        ]
    if errors:
        raise InvalidChanges(errors)
    return {key: body[key] for key in ALLOWED_CHANGES if key in body}


def apply_changes(
    lot: LotData, changes: dict[str, Any], today: datetime.date
) -> tuple[LotData, list[str]]:
    """Copia del lote con los cambios aplicados, más notas explicativas."""
    notes: list[str] = []
    events = list(lot.events)
    if 'cover_crop' in changes:
        has_cover = any(e.type == EventType.COVER_CROP for e in events)
        if changes['cover_crop']:
            if has_cover:
                notes.append('El lote ya tiene cultivo de cobertura en la bitácora: no cambia.')
            else:
                events.append(
                    EventData(
                        type=EventType.COVER_CROP,
                        date=today,
                        origin=Origin.ESTIMATED,
                        hypothetical=True,
                    )
                )
                notes.append('Se agregó un cultivo de cobertura hipotético (no se guarda).')
        else:
            events = [e for e in events if e.type != EventType.COVER_CROP]
            if has_cover:
                notes.append('Se quitaron los cultivos de cobertura de la copia (no se guarda).')
        notes.append(COVER_CROP_FOOTPRINT_NOTE)
    return replace(lot, events=tuple(events)), notes


def simulate(
    lot: LotData,
    body: Any,
    factors: dict[str, Factor],
    weights: dict[str, float | None],
    today: datetime.date | None = None,
) -> dict[str, Any]:
    """Huella y puntaje antes y después de los cambios. No toca la base."""
    changes = validate_changes(body)
    campaign = lot.find_campaign(body.get('campaign'))
    if body.get('campaign') not in (None, '') and campaign is None:
        raise InvalidChanges({'campaign': ['El lote no tiene una campaña con ese id o etiqueta.']})

    after_lot, notes = apply_changes(lot, changes, today or datetime.date.today())
    after_campaign = after_lot.find_campaign(campaign.id if campaign else None)
    before_score = compute_score(lot, weights)
    after_score = compute_score(after_lot, weights)
    before_status = {c['key']: c['status'] for c in before_score['criteria']}
    changed = [
        {
            'key': c['key'],
            'label': c['label'],
            'before': before_status[c['key']],
            'after': c['status'],
        }
        for c in after_score['criteria']
        if c['status'] != before_status[c['key']]
    ]
    return {
        'lot': lot.id,
        'changes': changes,
        'persisted': False,
        'message': NOT_PERSISTED_MESSAGE,
        'notes': notes,
        'changed_criteria': changed,
        'before': {
            'footprint': compute_footprint(lot, campaign, factors),
            'score': before_score,
        },
        'after': {
            'footprint': compute_footprint(after_lot, after_campaign, factors),
            'score': after_score,
        },
    }
