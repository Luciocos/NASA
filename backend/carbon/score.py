"""Puntaje de sustentabilidad provisional (0 a 100). Ver CLAUDE.md, sección 9.

Cada criterio se evalúa con la bitácora y las campañas del lote, y queda como
"cumple", "no_cumple" o "sin_dato", con el origen del dato que lo respalda:
- Un evento presente (por ejemplo una quema) toma el origen más respaldado de esos
  eventos: alcanza con una observación para afirmar que ocurrió.
- La ausencia de un tipo de evento en un lote que sí tiene bitácora se informa como
  ESTIMATED: es una inferencia, no una observación directa.
- Si el lote no tiene ningún evento, los criterios de bitácora quedan "sin dato".

El número solo se calcula si todos los pesos de score_config.yaml están definidos y
ningún criterio está "sin dato": puntaje = 100 x (suma de pesos que cumplen) / (suma de
todos los pesos). Con algún peso nulo se devuelve score: null y el motivo.
"""

from __future__ import annotations

from typing import Any

from carbon.data import LotData, strongest_origin, weakest_origin
from carbon.footprint import DISCLAIMER, LAND_USE_CHANGE_SINCE, confidence
from core.origin import Origin
from events.models import EventType
from lots.models import Crop

MET = 'cumple'
NOT_MET = 'no_cumple'
MISSING = 'sin_dato'
STATUS_LABELS = {MET: 'Cumple', NOT_MET: 'No cumple', MISSING: 'Sin dato'}

WEIGHTS_PENDING_MESSAGE = (
    'Puntaje numérico no disponible: pesos pendientes de definir por el equipo (score_config.yaml).'
)

CRITERIA: tuple[tuple[str, str], ...] = (
    ('no_land_use_change_since_2020', 'Sin cambio de uso del suelo desde 2020'),
    ('no_till', 'Siembra directa (sin remoción de suelo)'),
    ('winter_cover', 'Cobertura invernal (cultivo de cobertura)'),
    ('rotation', 'Rotación de cultivos entre campañas'),
    ('no_burn', 'Sin quema'),
)
EVENT_LABELS = dict(EventType.choices)
CROP_LABELS = dict(Crop.choices)


def _criterion(key: str, label: str, status: str, origin: str | None, reason: str) -> dict:
    return {
        'key': key,
        'label': label,
        'status': status,
        'status_label': STATUS_LABELS[status],
        'origin': origin,
        'reason': reason,
        'evidence': [],
        'is_simulated': False,
        'hypothetical': False,
        'weight': None,
    }


def _event_criterion(
    lot: LotData, key: str, label: str, event_type: str, met_if_present: bool, since=None
) -> dict[str, Any]:
    name = EVENT_LABELS[event_type].lower()
    events = [e for e in lot.events if e.type == event_type and (since is None or e.date >= since)]
    period = ' desde 2020' if since else ''
    if events:
        result = _criterion(
            key,
            label,
            MET if met_if_present else NOT_MET,
            strongest_origin([e.origin for e in events]),
            f'La bitácora registra {len(events)} evento/s de {name}{period}.',
        )
        result['evidence'] = [
            {
                'type': e.type,
                'date': e.date.isoformat(),
                'origin': e.origin,
                'is_simulated': e.is_simulated,
                'hypothetical': e.hypothetical,
            }
            for e in events
        ]
        result['is_simulated'] = any(e.is_simulated for e in events)
        result['hypothetical'] = any(e.hypothetical for e in events)
        return result
    if lot.events:
        result = _criterion(
            key,
            label,
            NOT_MET if met_if_present else MET,
            Origin.ESTIMATED,
            f'No hay eventos de {name}{period} en la bitácora. La ausencia es inferida, '
            'no una observación directa.',
        )
        # Una ausencia inferida de una bitácora simulada también es simulada.
        result['is_simulated'] = any(e.is_simulated for e in lot.events)
        return result
    return _criterion(
        key, label, MISSING, None, 'El lote no tiene eventos importados en la bitácora.'
    )


def _rotation_criterion(lot: LotData, key: str, label: str) -> dict[str, Any]:
    campaigns = lot.campaigns
    if len(campaigns) < 2:
        return _criterion(
            key, label, MISSING, None, 'Hacen falta al menos dos campañas para evaluar rotación.'
        )
    crops = {c.crop for c in campaigns}
    origin = weakest_origin([c.crop_origin for c in campaigns])
    sequence = ', '.join(f'{c.label}: {CROP_LABELS.get(c.crop, c.crop)}' for c in campaigns)
    if len(crops) > 1:
        return _criterion(
            key, label, MET, origin, f'Cultivos distintos entre campañas ({sequence}).'
        )
    return _criterion(
        key, label, NOT_MET, origin, f'Mismo cultivo en todas las campañas ({sequence}).'
    )


def evaluate_criteria(lot: LotData) -> list[dict[str, Any]]:
    labels = dict(CRITERIA)
    return [
        _event_criterion(
            lot,
            'no_land_use_change_since_2020',
            labels['no_land_use_change_since_2020'],
            EventType.LAND_USE_CHANGE,
            met_if_present=False,
            since=LAND_USE_CHANGE_SINCE,
        ),
        _event_criterion(lot, 'no_till', labels['no_till'], EventType.TILLAGE, False),
        _event_criterion(lot, 'winter_cover', labels['winter_cover'], EventType.COVER_CROP, True),
        _rotation_criterion(lot, 'rotation', labels['rotation']),
        _event_criterion(lot, 'no_burn', labels['no_burn'], EventType.BURN, False),
    ]


def compute_score(lot: LotData, weights: dict[str, float | None]) -> dict[str, Any]:
    """Puntaje del lote. Función pura: no lee ni escribe la base."""
    criteria = evaluate_criteria(lot)
    for criterion in criteria:
        criterion['weight'] = weights.get(criterion['key'])

    weights_defined = all(c['weight'] is not None for c in criteria)
    missing = [c['key'] for c in criteria if c['status'] == MISSING]
    total_weight = sum(c['weight'] for c in criteria) if weights_defined else 0
    score = None
    if not weights_defined:
        message = WEIGHTS_PENDING_MESSAGE
    elif missing:
        message = f'Puntaje numérico no disponible: faltan datos para {len(missing)} criterio/s.'
    elif total_weight <= 0:
        message = 'Puntaje numérico no disponible: la suma de los pesos es cero.'
    else:
        met = sum(c['weight'] for c in criteria if c['status'] == MET)
        score = round(100 * met / total_weight, 1)
        message = None

    origins = [c['origin'] for c in criteria if c['origin']]
    return {
        'lot': lot.id,
        'provisional': True,
        'disclaimer': DISCLAIMER,
        'score': score,
        'max_score': 100,
        'weights_defined': weights_defined,
        'message': message,
        'criteria': criteria,
        'missing_criteria': missing,
        'confidence': confidence(origins),
        'uses_simulated_data': any(c['is_simulated'] for c in criteria),
    }
