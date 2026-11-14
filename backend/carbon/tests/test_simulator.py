"""Pruebas del simulador (funciones puras, sin base de datos)."""

import datetime

import pytest

from carbon.simulator import NOT_PERSISTED_MESSAGE, InvalidChanges, simulate, validate_changes
from carbon.tests.conftest import make_campaign, make_event, make_lot
from carbon.tests.test_score import FAKE_WEIGHTS, NULL_WEIGHTS

TODAY = datetime.date(2026, 11, 14)


def statuses(score: dict) -> dict[str, str]:
    return {c['key']: c['status'] for c in score['criteria']}


def test_sumar_cobertura_cambia_el_criterio_y_no_la_huella(fake_factors) -> None:
    lot = make_lot([make_campaign(id=1, label='2024/25', crop='CORN'), make_campaign(id=2)])
    result = simulate(lot, {'cover_crop': True}, fake_factors, FAKE_WEIGHTS, today=TODAY)

    assert result['persisted'] is False
    assert result['message'] == NOT_PERSISTED_MESSAGE
    assert statuses(result['before']['score'])['winter_cover'] == 'no_cumple'
    assert statuses(result['after']['score'])['winter_cover'] == 'cumple'
    after_cover = next(
        c for c in result['after']['score']['criteria'] if c['key'] == 'winter_cover'
    )
    assert after_cover['hypothetical'] is True
    assert result['changed_criteria'] == [
        {
            'key': 'winter_cover',
            'label': after_cover['label'],
            'before': 'no_cumple',
            'after': 'cumple',
        }
    ]
    assert result['before']['score']['score'] == 80.0
    assert result['after']['score']['score'] == 100.0
    before_total = result['before']['footprint']['total_kg_co2e_per_t']
    assert result['after']['footprint']['total_kg_co2e_per_t'] == before_total
    assert any('no está modelado' in note for note in result['notes'])


def test_con_factores_y_pesos_nulos_el_despues_tambien_es_sin_dato(null_factors) -> None:
    lot = make_lot([make_campaign(id=1, label='2024/25', crop='CORN'), make_campaign(id=2)])
    result = simulate(lot, {'cover_crop': True}, null_factors, NULL_WEIGHTS, today=TODAY)
    assert result['after']['footprint']['total_kg_co2e_per_t'] is None
    assert result['after']['score']['score'] is None
    assert statuses(result['after']['score'])['winter_cover'] == 'cumple'


def test_no_modifica_los_datos_de_entrada(fake_factors) -> None:
    lot = make_lot()
    events_before = lot.events
    simulate(lot, {'cover_crop': True}, fake_factors, NULL_WEIGHTS, today=TODAY)
    assert lot.events == events_before
    assert all(not e.hypothetical for e in lot.events)


def test_cobertura_existente_no_se_duplica(fake_factors) -> None:
    lot = make_lot(events=[make_event('COVER_CROP')])
    result = simulate(lot, {'cover_crop': True}, fake_factors, NULL_WEIGHTS, today=TODAY)
    assert result['changed_criteria'] == []
    assert any('ya tiene' in note for note in result['notes'])


def test_quitar_cobertura(fake_factors) -> None:
    lot = make_lot(events=[make_event('COVER_CROP'), make_event('SOWING')])
    result = simulate(lot, {'cover_crop': False}, fake_factors, NULL_WEIGHTS, today=TODAY)
    assert statuses(result['after']['score'])['winter_cover'] == 'no_cumple'


def test_campania_inexistente(fake_factors) -> None:
    with pytest.raises(InvalidChanges) as error:
        simulate(
            make_lot(), {'cover_crop': True, 'campaign': '1999/00'}, fake_factors, NULL_WEIGHTS
        )
    assert 'campaign' in error.value.errors


@pytest.mark.parametrize(
    'body, field',
    [
        ({}, 'non_field_errors'),
        ([], 'non_field_errors'),
        ({'cover_crop': 'si'}, 'cover_crop'),
        ({'cover_crop': True, 'no_till': True}, 'no_till'),
    ],
)
def test_cuerpo_invalido(body, field) -> None:
    with pytest.raises(InvalidChanges) as error:
        validate_changes(body)
    assert field in error.value.errors
