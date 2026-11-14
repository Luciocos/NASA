"""Importador del contrato de eventos. Ver CLAUDE.md, sección 8.

El formato JSON es el contrato con el pipeline offline: no cambiarlo sin avisar.
"""

from datetime import date
from typing import Any

from django.db import transaction

from core.geo import validate_polygon
from core.origin import Origin
from events.models import Event, EventType, Sensor
from lots.models import Campaign, Crop, Lot


class ImportValidationError(Exception):
    """El JSON no cumple el contrato. `errors` lista todos los problemas encontrados."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__('; '.join(errors))
        self.errors = errors


class LotAlreadyExistsError(Exception):
    """Ya hay un lote con ese nombre y no se pidió reemplazarlo."""


def _check_choice(value: Any, choices: type, field: str, errors: list[str]) -> None:
    if value not in choices.values:
        valid = ', '.join(choices.values)
        errors.append(f'{field}: "{value}" no es válido (opciones: {valid})')


def _parse_date(value: Any, field: str, errors: list[str]) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        errors.append(f'{field}: "{value}" no es una fecha AAAA-MM-DD')
        return None


def validate(data: Any) -> list[str]:
    """Devuelve todos los errores del JSON contra el contrato (lista vacía si es válido)."""
    if not isinstance(data, dict):
        return ['el archivo debe contener un objeto JSON']

    errors: list[str] = []

    lot = data.get('lot')
    if not isinstance(lot, dict):
        errors.append('lot: falta el objeto del lote')
    else:
        if not lot.get('name'):
            errors.append('lot.name: es obligatorio')
        errors.extend(f'lot.{e}' for e in validate_polygon(lot.get('geometry')))

    campaigns = data.get('campaigns', [])
    labels: set[str] = set()
    if not isinstance(campaigns, list):
        errors.append('campaigns: debe ser una lista')
        campaigns = []
    for i, campaign in enumerate(campaigns):
        where = f'campaigns[{i}]'
        if not isinstance(campaign, dict):
            errors.append(f'{where}: debe ser un objeto')
            continue
        label = campaign.get('label')
        if not label:
            errors.append(f'{where}.label: es obligatorio')
        elif label in labels:
            errors.append(f'{where}.label: "{label}" está repetido')
        else:
            labels.add(label)
        _check_choice(campaign.get('crop'), Crop, f'{where}.crop', errors)
        _check_choice(campaign.get('crop_origin'), Origin, f'{where}.crop_origin', errors)
        if campaign.get('yield_origin'):
            _check_choice(campaign['yield_origin'], Origin, f'{where}.yield_origin', errors)

    events = data.get('events', [])
    if not isinstance(events, list):
        errors.append('events: debe ser una lista')
        events = []
    for i, event in enumerate(events):
        where = f'events[{i}]'
        if not isinstance(event, dict):
            errors.append(f'{where}: debe ser un objeto')
            continue
        _check_choice(event.get('type'), EventType, f'{where}.type', errors)
        _check_choice(event.get('sensor'), Sensor, f'{where}.sensor', errors)
        _check_choice(event.get('origin'), Origin, f'{where}.origin', errors)
        _parse_date(event.get('date'), f'{where}.date', errors)
        confidence = event.get('confidence')
        if confidence is not None and not (
            isinstance(confidence, int | float) and 0 <= confidence <= 1
        ):
            errors.append(f'{where}.confidence: debe ser un número entre 0 y 1, o null')
        uncertainty = event.get('date_uncertainty_days')
        if uncertainty is not None and not (isinstance(uncertainty, int) and uncertainty >= 0):
            errors.append(f'{where}.date_uncertainty_days: debe ser un entero positivo o null')
        if event.get('campaign') and event['campaign'] not in labels:
            errors.append(f'{where}.campaign: "{event["campaign"]}" no está en campaigns')
        if not isinstance(event.get('is_simulated', False), bool):
            errors.append(f'{where}.is_simulated: debe ser true o false')
        if not isinstance(event.get('metrics', {}), dict):
            errors.append(f'{where}.metrics: debe ser un objeto')

    return errors


@transaction.atomic
def import_lot(data: Any, *, replace: bool = False) -> Lot:
    """Valida y carga un lote con sus campañas y eventos.

    Si ya existe un lote con el mismo nombre, falla salvo que `replace` sea True.
    Con `replace`, se borra el lote anterior completo, incluidas las correcciones del usuario.
    """
    errors = validate(data)
    if errors:
        raise ImportValidationError(errors)

    lot_data = data['lot']
    existing = Lot.objects.filter(name=lot_data['name'])
    if existing.exists():
        if not replace:
            raise LotAlreadyExistsError(lot_data['name'])
        existing.delete()

    lot = Lot.objects.create(
        name=lot_data['name'],
        renspa=lot_data.get('renspa') or '',
        locality=lot_data.get('locality') or '',
        province=lot_data.get('province') or '',
        geometry=lot_data['geometry'],
    )

    campaigns: dict[str, Campaign] = {}
    for campaign in data.get('campaigns', []):
        campaigns[campaign['label']] = Campaign.objects.create(
            lot=lot,
            label=campaign['label'],
            crop=campaign['crop'],
            crop_origin=campaign['crop_origin'],
            yield_t_ha=campaign.get('yield_t_ha'),
            yield_origin=campaign.get('yield_origin') or '',
        )

    for event in data.get('events', []):
        Event.objects.create(
            lot=lot,
            campaign=campaigns.get(event.get('campaign')),
            type=event['type'],
            date=date.fromisoformat(event['date']),
            date_uncertainty_days=event.get('date_uncertainty_days'),
            sensor=event['sensor'],
            origin=event['origin'],
            confidence=event.get('confidence'),
            evidence_image=event.get('evidence_image') or '',
            evidence_optical_image=event.get('evidence_optical_image') or '',
            metrics=event.get('metrics') or {},
            is_simulated=event.get('is_simulated', False),
            notes=event.get('notes') or '',
        )

    return lot
