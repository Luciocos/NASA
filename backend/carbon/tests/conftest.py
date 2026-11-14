"""Datos armados para las pruebas de carbono.

TODOS LOS NÚMEROS DE ESTE ARCHIVO SON FICTICIOS. No son factores de emisión ni pesos
reales y no deben copiarse a factors.yaml ni a score_config.yaml.
"""

import datetime

import pytest

from carbon.config import Factor, parse_factors
from carbon.data import CampaignData, EventData, InputData, LotData

FAKE_SOURCE = 'Valor ficticio para pruebas (no es una fuente)'


def fake_factor(value: float, unit: str = 'kg CO2e/kg') -> dict:
    return {'value': value, 'unit': unit, 'source': FAKE_SOURCE, 'validated': True}


@pytest.fixture
def fake_factors() -> dict[str, Factor]:
    """Los siete factores completos, con valores redondos e inventados para la prueba."""
    return parse_factors(
        {
            'fertilizer_n_production': fake_factor(2.0),
            'fertilizer_p_production': fake_factor(1.0),
            'soil_n2o': fake_factor(3.0),
            'diesel': fake_factor(10.0, 'kg CO2e/l'),
            'pesticides': fake_factor(5.0),
            'seed': fake_factor(0.5),
            'land_use_change': fake_factor(1000.0, 'kg CO2e/ha'),
        }
    )


@pytest.fixture
def null_factors() -> dict[str, Factor]:
    """Como factors.yaml hoy: todos los valores nulos y sin validar."""
    keys = [
        'fertilizer_n_production',
        'fertilizer_p_production',
        'soil_n2o',
        'diesel',
        'pesticides',
        'seed',
        'land_use_change',
    ]
    return parse_factors(
        {k: {'value': None, 'unit': None, 'source': None, 'validated': False} for k in keys}
    )


def make_campaign(**overrides) -> CampaignData:
    values = {
        'id': 1,
        'label': '2025/26',
        'crop': 'SOY',
        'crop_origin': 'VERIFIED',
        'yield_t_ha': 4.0,
        'yield_origin': 'DECLARED',
        'inputs': (
            InputData('FERTILIZER_N', 10.0, 'kg/ha', 'DECLARED'),
            InputData('FERTILIZER_P', 20.0, 'kg/ha', 'DECLARED'),
            InputData('DIESEL', 4.0, 'l/ha', 'VERIFIED'),
            InputData('PESTICIDE', 2.0, 'kg/ha', 'ESTIMATED'),
            InputData('SEED', 60.0, 'kg/ha', 'DECLARED'),
        ),
    }
    values.update(overrides)
    return CampaignData(**values)


def make_event(type_: str, date: str = '2025-06-15', origin: str = 'VERIFIED', **kw) -> EventData:
    return EventData(type=type_, date=datetime.date.fromisoformat(date), origin=origin, **kw)


def make_lot(campaigns=None, events=None) -> LotData:
    return LotData(
        id=1,
        name='Lote de prueba',
        campaigns=tuple(campaigns if campaigns is not None else [make_campaign()]),
        events=tuple(events if events is not None else [make_event('SOWING')]),
    )
