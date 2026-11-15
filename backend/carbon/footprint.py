"""Huella de carbono estimada por tonelada. Ver CLAUDE.md, sección 9.

Fórmula: huella por tonelada = suma de (dato de actividad x factor de emisión) / rendimiento.

Convención de unidades (documentada para quien cargue factores e insumos):
- El factor se expresa como "kg CO2e/<u>", por ejemplo "kg CO2e/kg" o "kg CO2e/l".
- El insumo (InputRecord) se expresa por hectárea en la misma unidad: "<u>/ha",
  por ejemplo "kg/ha" o "l/ha". Si no coinciden, el componente queda "sin dato".
- Así cada componente da kg CO2e/ha y, dividido por el rendimiento (t/ha), kg CO2e/t.
- Cambio de uso del suelo: el factor se expresa como "kg CO2e/ha" (por hectárea
  convertida). La actividad es 1 ha/ha si la bitácora tiene un evento LAND_USE_CHANGE
  desde 2020. Si el lote tiene eventos pero ninguno de cambio de uso, el aporte es 0
  y la ausencia se informa como dato ESTIMATED (inferido, no observado).

Reglas:
- Nunca falla por falta de datos: cada componente sin factor validado o sin dato de
  actividad se informa como "sin dato" con su motivo.
- El total por tonelada solo se informa si están todos los componentes y el rendimiento.
  No se informan totales parciales: sumar solo lo que hay subestimaría la huella.
- Nivel de confianza global (sobre los datos del lote: insumos, rendimiento y evidencia
  de cambio de uso; los factores no cuentan porque son constantes con fuente citada):
  ALTO si los datos VERIFIED + DECLARED son más que los ESTIMATED; BAJO si los
  ESTIMATED son igual o más (el empate se resuelve hacia abajo); SIN DATOS si no hay
  ningún dato del lote.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any

from carbon.config import Factor
from carbon.data import CampaignData, LotData, strongest_origin, weakest_origin
from carbon.models import InputCategory
from core.origin import Origin
from events.models import EventType

DISCLAIMER = (
    'Estimación con respaldo satelital. Prueba de concepto: no es una calculadora auditada '
    'ni reemplaza a VISEC, RTRS o 2BSvs.'
)
UNIT = 'kg CO2e/t'
LAND_USE_CHANGE_SINCE = datetime.date(2020, 1, 1)

STATUS_CALCULATED = 'calculado'
STATUS_MISSING = 'sin_dato'

CONFIDENCE_HIGH = 'ALTO'
CONFIDENCE_LOW = 'BAJO'
CONFIDENCE_NONE = 'SIN DATOS'
CONFIDENCE_RULE = (
    'ALTO si la mayoría de los datos del lote son verificados o declarados; BAJO si '
    'predominan los estimados o hay empate; SIN DATOS si no hay ningún dato del lote.'
)


@dataclass(frozen=True)
class Component:
    key: str
    label: str
    factor_key: str
    # Categorías de InputRecord que dan el dato de actividad. None: cambio de uso.
    categories: tuple[str, ...] | None


COMPONENTS: tuple[Component, ...] = (
    Component(
        'fertilizer_n_production',
        'Producción de fertilizante nitrogenado',
        'fertilizer_n_production',
        (InputCategory.FERTILIZER_N,),
    ),
    Component(
        'fertilizer_p_production',
        'Producción de fertilizante fosforado',
        'fertilizer_p_production',
        (InputCategory.FERTILIZER_P,),
    ),
    Component(
        'soil_n2o',
        'Emisiones de N2O del suelo (por nitrógeno aplicado)',
        'soil_n2o',
        (InputCategory.FERTILIZER_N,),
    ),
    Component('diesel', 'Gasoil de labores', 'diesel', (InputCategory.DIESEL,)),
    Component('pesticides', 'Fitosanitarios', 'pesticides', (InputCategory.PESTICIDE,)),
    Component('seed', 'Semilla', 'seed', (InputCategory.SEED,)),
    Component('land_use_change', 'Cambio de uso del suelo (desde 2020)', 'land_use_change', None),
)
USED_CATEGORIES = {category for c in COMPONENTS for category in (c.categories or ())}


def confidence(origins: list[str]) -> dict[str, Any]:
    """Nivel de confianza global a partir de los orígenes de los datos usados."""
    counts = {origin: origins.count(origin) for origin in Origin.values}
    backed = counts[Origin.VERIFIED] + counts[Origin.DECLARED]
    if not origins:
        level = CONFIDENCE_NONE
    elif backed > counts[Origin.ESTIMATED]:
        level = CONFIDENCE_HIGH
    else:
        level = CONFIDENCE_LOW
    return {'level': level, 'counts': counts, 'total': len(origins), 'rule': CONFIDENCE_RULE}


def _normalize_unit(unit: str) -> str:
    return ''.join(unit.split()).lower()


def activity_unit(factor: Factor) -> str | None:
    """Unidad que debe tener el insumo para usar el factor: "kg CO2e/kg" -> "kg/ha"."""
    if not factor.unit or '/' not in factor.unit:
        return None
    numerator, denominator = factor.unit.split('/', 1)
    if _normalize_unit(numerator) != 'kgco2e' or not denominator.strip():
        return None
    return f'{denominator.strip()}/ha'


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:] + '.'


def _empty_activity() -> dict[str, Any]:
    return {
        'quantity': None,
        'unit': None,
        'origin': None,
        'origins': [],
        'records': 0,
        'reference': None,
    }


def _factor_problem(factor: Factor | None) -> str | None:
    if factor is None:
        return 'el factor de emisión no está definido en factors.yaml'
    if factor.problem:
        return factor.problem
    if activity_unit(factor) is None:
        return f'la unidad del factor ("{factor.unit}") no tiene la forma "kg CO2e/<unidad>"'
    return None


def _component_result(
    component: Component,
    factor: Factor | None,
    activity: dict[str, Any],
    problems: list[str],
    is_simulated: bool,
    hypothetical: bool = False,
    note: str | None = None,
) -> dict[str, Any]:
    kg_per_ha = None
    if not problems:
        kg_per_ha = activity['quantity'] * factor.value if activity['quantity'] else 0.0
    return {
        'key': component.key,
        'label': component.label,
        'status': STATUS_CALCULATED if not problems else STATUS_MISSING,
        'reason': _sentence('; '.join(problems)) if problems else None,
        'note': note,
        'activity': activity,
        'factor': factor.as_dict() if factor else {'key': component.factor_key},
        'kg_co2e_per_ha': kg_per_ha,
        'kg_co2e_per_t': None,
        'is_simulated': is_simulated,
        'hypothetical': hypothetical,
    }


def factor_for(
    component: Component, campaign: CampaignData | None, factors: dict[str, Factor]
) -> Factor | None:
    """Factor del componente. La semilla depende del cultivo: seed_<cultivo> o seed."""
    if component.key == 'seed' and campaign is not None:
        by_crop = factors.get(f'seed_{campaign.crop.lower()}')
        if by_crop is not None:
            return by_crop
    return factors.get(component.factor_key)


def _input_component(
    component: Component, campaign: CampaignData | None, factor: Factor | None
) -> dict[str, Any]:
    problems: list[str] = []
    factor_problem = _factor_problem(factor)
    if factor_problem:
        problems.append(factor_problem)
    if campaign is None:
        problems.append('el lote no tiene campañas registradas')
        return _component_result(component, factor, _empty_activity(), problems, False)

    records = [r for r in campaign.inputs if r.category in (component.categories or ())]
    origins = [r.origin for r in records]
    references = sorted({r.reference for r in records if r.reference})
    activity = _empty_activity() | {
        'origin': weakest_origin(origins),
        'origins': origins,
        'records': len(records),
        # Fuente si el dato es un valor de referencia (no es del lote ni del satélite)
        'reference': '; '.join(references) or None,
    }
    if not records:
        problems.append(
            f'no hay insumos de esta categoría cargados para la campaña {campaign.label}'
        )
    elif not factor_problem:
        expected = activity_unit(factor)
        wrong = sorted(
            {r.unit for r in records if _normalize_unit(r.unit) != _normalize_unit(expected)}
        )
        if wrong:
            problems.append(
                f'unidad incompatible: el factor espera insumos en "{expected}" y hay '
                f'registros en {", ".join(repr(unit) for unit in wrong)}'
            )
        else:
            activity['quantity'] = sum(r.quantity for r in records)
            activity['unit'] = expected
    is_simulated = any(r.is_simulated for r in records)
    return _component_result(component, factor, activity, problems, is_simulated)


def _land_use_component(
    component: Component, lot: LotData, factor: Factor | None
) -> dict[str, Any]:
    events = [
        e
        for e in lot.events
        if e.type == EventType.LAND_USE_CHANGE and e.date >= LAND_USE_CHANGE_SINCE
    ]
    if events:
        origins = [e.origin for e in events]
        activity = {
            'quantity': 1.0,
            'unit': 'ha/ha',
            'origin': strongest_origin(origins),
            'origins': origins,
            'records': len(events),
            'detected': True,
            'reference': None,
        }
        factor_problem = _factor_problem(factor)
        problems = [factor_problem] if factor_problem else []
        if not problems and _normalize_unit(activity_unit(factor) or '') != 'ha/ha':
            problems.append(
                f'la unidad del factor de cambio de uso debe ser "kg CO2e/ha" y es "{factor.unit}"'
            )
        return _component_result(
            component,
            factor,
            activity,
            problems,
            is_simulated=any(e.is_simulated for e in events),
            hypothetical=any(e.hypothetical for e in events),
            note=f'Se detectó cambio de uso del suelo desde 2020 ({len(events)} evento/s).',
        )
    # Sin evento satelital, vale lo que declaró el productor (más fuerte que una ausencia inferida)
    if lot.land_use_unchanged is not None:
        changed = not lot.land_use_unchanged
        activity = {
            'quantity': 1.0 if changed else 0.0,
            'unit': 'ha/ha',
            'origin': Origin.DECLARED,
            'origins': [Origin.DECLARED],
            'records': 0,
            'detected': changed,
            'reference': None,
        }
        problems = []
        if changed:
            factor_problem = _factor_problem(factor)
            problems = [factor_problem] if factor_problem else []
        return _component_result(
            component,
            factor,
            activity,
            problems,
            is_simulated=False,
            note=(
                'El productor declaró que el lote cambió de uso del suelo desde 2020.'
                if changed
                else 'El productor declaró que el lote no cambió de uso del suelo desde 2020: '
                'aporte 0 (dato declarado, no observado por satélite).'
            ),
        )
    if lot.has_observed_events:
        activity = {
            'quantity': 0.0,
            'unit': 'ha/ha',
            'origin': Origin.ESTIMATED,
            'origins': [Origin.ESTIMATED],
            'records': 0,
            'detected': False,
            'reference': None,
        }
        return _component_result(
            component,
            factor,
            activity,
            [],
            # Una ausencia inferida de una bitácora simulada también es simulada.
            is_simulated=any(e.is_simulated for e in lot.events),
            note=(
                'No hay eventos de cambio de uso del suelo desde 2020 en la bitácora: aporte 0. '
                'La ausencia es inferida, no una observación directa (dato estimado).'
            ),
        )
    return _component_result(
        component,
        factor,
        _empty_activity() | {'detected': None},
        ['el lote no tiene eventos importados: no se sabe si hubo cambio de uso desde 2020'],
        is_simulated=False,
    )


def _yield_info(campaign: CampaignData | None) -> dict[str, Any]:
    info: dict[str, Any] = {
        'value': None,
        'unit': 't/ha',
        'origin': None,
        'reason': None,
        'reference': None,
    }
    if campaign is None:
        return info | {'status': STATUS_MISSING, 'reason': 'El lote no tiene campañas.'}
    if campaign.yield_t_ha is None:
        return info | {
            'status': STATUS_MISSING,
            'reason': (
                f'Falta el rendimiento de la campaña {campaign.label}: sin rendimiento no se '
                'puede expresar la huella por tonelada.'
            ),
        }
    origin = campaign.yield_origin or Origin.ESTIMATED
    if campaign.yield_t_ha <= 0:
        return info | {
            'status': STATUS_MISSING,
            'origin': origin,
            'reason': 'El rendimiento cargado no es mayor que cero.',
        }
    return info | {
        'status': STATUS_CALCULATED,
        'value': campaign.yield_t_ha,
        'origin': origin,
        'reference': campaign.yield_reference,
    }


def _campaign_info(campaign: CampaignData | None) -> dict[str, Any] | None:
    if campaign is None:
        return None
    return {
        'id': campaign.id,
        'label': campaign.label,
        'crop': campaign.crop,
        'crop_origin': campaign.crop_origin,
    }


def compute_footprint(
    lot: LotData, campaign: CampaignData | None, factors: dict[str, Factor]
) -> dict[str, Any]:
    """Huella de una campaña del lote. Función pura: no lee ni escribe la base."""
    components = [
        _land_use_component(c, lot, factors.get(c.factor_key))
        if c.categories is None
        else _input_component(c, campaign, factor_for(c, campaign, factors))
        for c in COMPONENTS
    ]
    yield_info = _yield_info(campaign)
    yield_value = yield_info['value']
    for item in components:
        if item['kg_co2e_per_ha'] is not None and yield_value:
            item['kg_co2e_per_t'] = item['kg_co2e_per_ha'] / yield_value

    missing = [c['key'] for c in components if c['status'] == STATUS_MISSING]
    complete = not missing and yield_value is not None
    total = sum(c['kg_co2e_per_t'] for c in components) if complete else None

    # Datos del lote usados (cada insumo una sola vez, aunque sirva a dos componentes).
    data_origins: list[str] = []
    simulated = False
    if yield_info['origin'] and yield_value is not None:
        data_origins.append(yield_info['origin'])
    if campaign is not None:
        for record in campaign.inputs:
            if record.category in USED_CATEGORIES:
                data_origins.append(record.origin)
                simulated = simulated or record.is_simulated
    land_use = components[-1]
    data_origins.extend(land_use['activity']['origins'])
    simulated = simulated or land_use['is_simulated']

    if complete:
        message = None
    else:
        parts = []
        if missing:
            parts.append(f'faltan {len(missing)} de {len(components)} componentes')
        if yield_value is None:
            parts.append('falta el rendimiento')
        message = 'No se puede calcular todavía: ' + ' y '.join(parts) + '.'

    return {
        'lot': lot.id,
        'campaign': _campaign_info(campaign),
        'available_campaigns': [{'id': c.id, 'label': c.label} for c in lot.campaigns],
        'provisional': True,
        'disclaimer': DISCLAIMER,
        'unit': UNIT,
        'complete': complete,
        'total_kg_co2e_per_t': total,
        'message': message,
        'missing_components': missing,
        'yield': yield_info,
        'components': components,
        'confidence': confidence(data_origins),
        'uses_simulated_data': simulated,
    }
