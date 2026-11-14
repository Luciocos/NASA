"""Pruebas del puntaje provisional. Los pesos son ficticios (ver conftest.py)."""

from carbon.config import parse_weights
from carbon.score import WEIGHTS_PENDING_MESSAGE, compute_score
from carbon.tests.conftest import make_campaign, make_event, make_lot

# Pesos inventados para la prueba: no son una propuesta del equipo.
FAKE_WEIGHTS = {
    'no_land_use_change_since_2020': 1.0,
    'no_till': 1.0,
    'winter_cover': 1.0,
    'rotation': 1.0,
    'no_burn': 1.0,
}
NULL_WEIGHTS = dict.fromkeys(FAKE_WEIGHTS)


def two_campaigns(first='CORN', second='SOY'):
    return [
        make_campaign(id=1, label='2024/25', crop=first, crop_origin='VERIFIED'),
        make_campaign(id=2, label='2025/26', crop=second, crop_origin='DECLARED'),
    ]


def criteria(result: dict) -> dict[str, dict]:
    return {c['key']: c for c in result['criteria']}


def test_con_pesos_nulos_no_hay_numero_pero_si_criterios() -> None:
    lot = make_lot(two_campaigns(), [make_event('COVER_CROP', origin='DECLARED')])
    result = compute_score(lot, NULL_WEIGHTS)
    assert result['score'] is None
    assert result['weights_defined'] is False
    assert result['message'] == WEIGHTS_PENDING_MESSAGE
    assert 'pesos pendientes de definir por el equipo' in result['message']
    assert result['provisional'] is True
    assert len(result['criteria']) == 5
    assert criteria(result)['winter_cover']['status'] == 'cumple'
    assert criteria(result)['winter_cover']['origin'] == 'DECLARED'


def test_peso_faltante_en_el_yaml_cuenta_como_no_definido() -> None:
    weights = {k: v for k, v in FAKE_WEIGHTS.items() if k != 'no_burn'}
    lot = make_lot(two_campaigns(), [make_event('COVER_CROP')])
    assert compute_score(lot, weights)['score'] is None


def test_parse_weights_descarta_valores_no_numericos() -> None:
    weights = parse_weights({'weights': {'a': None, 'b': 'diez', 'c': -1, 'd': True, 'e': 2}})
    assert weights == {'a': None, 'b': None, 'c': None, 'd': None, 'e': 2.0}


def test_con_pesos_definidos_calcula_el_puntaje() -> None:
    lot = make_lot(
        two_campaigns(),
        [make_event('COVER_CROP'), make_event('TILLAGE', '2025-09-01')],
    )
    result = compute_score(lot, FAKE_WEIGHTS)
    # Cumplen 4 de 5 criterios con pesos iguales: todos menos siembra directa.
    assert criteria(result)['no_till']['status'] == 'no_cumple'
    assert result['score'] == 80.0
    assert result['message'] is None


def test_sin_eventos_los_criterios_de_bitacora_quedan_sin_dato() -> None:
    lot = make_lot(two_campaigns(), events=[])
    result = compute_score(lot, FAKE_WEIGHTS)
    statuses = {k: c['status'] for k, c in criteria(result).items()}
    assert statuses == {
        'no_land_use_change_since_2020': 'sin_dato',
        'no_till': 'sin_dato',
        'winter_cover': 'sin_dato',
        'rotation': 'cumple',
        'no_burn': 'sin_dato',
    }
    assert result['score'] is None
    assert 'faltan datos' in result['message']


def test_ausencia_de_evento_es_estimada() -> None:
    lot = make_lot(two_campaigns(), [make_event('SOWING')])
    result = criteria(compute_score(lot, NULL_WEIGHTS))
    assert result['no_burn']['status'] == 'cumple'
    assert result['no_burn']['origin'] == 'ESTIMATED'
    assert result['no_till']['status'] == 'cumple'
    assert result['winter_cover']['status'] == 'no_cumple'
    assert result['winter_cover']['origin'] == 'ESTIMATED'


def test_quema_y_cambio_de_uso_no_cumplen_con_origen_del_evento() -> None:
    lot = make_lot(
        two_campaigns(),
        [
            make_event('BURN', '2024-08-01', 'ESTIMATED'),
            make_event('BURN', '2025-08-01', 'VERIFIED'),
            make_event('LAND_USE_CHANGE', '2020-05-01', 'DECLARED'),
        ],
    )
    result = criteria(compute_score(lot, NULL_WEIGHTS))
    assert result['no_burn']['status'] == 'no_cumple'
    assert result['no_burn']['origin'] == 'VERIFIED'
    assert len(result['no_burn']['evidence']) == 2
    assert result['no_land_use_change_since_2020']['status'] == 'no_cumple'
    assert result['no_land_use_change_since_2020']['origin'] == 'DECLARED'


def test_cambio_de_uso_anterior_a_2020_no_afecta() -> None:
    lot = make_lot(two_campaigns(), [make_event('LAND_USE_CHANGE', '2018-01-01')])
    result = criteria(compute_score(lot, NULL_WEIGHTS))
    assert result['no_land_use_change_since_2020']['status'] == 'cumple'


def test_rotacion() -> None:
    one = make_lot([make_campaign()], [make_event('SOWING')])
    assert criteria(compute_score(one, NULL_WEIGHTS))['rotation']['status'] == 'sin_dato'

    same = make_lot(two_campaigns('SOY', 'SOY'), [make_event('SOWING')])
    assert criteria(compute_score(same, NULL_WEIGHTS))['rotation']['status'] == 'no_cumple'

    rotated = criteria(compute_score(make_lot(two_campaigns()), NULL_WEIGHTS))['rotation']
    assert rotated['status'] == 'cumple'
    assert rotated['origin'] == 'DECLARED'  # el menos respaldado de los dos cultivos
    assert 'Maíz' in rotated['reason']


def test_evento_simulado_marca_el_criterio() -> None:
    lot = make_lot(two_campaigns(), [make_event('COVER_CROP', is_simulated=True)])
    result = compute_score(lot, NULL_WEIGHTS)
    assert criteria(result)['winter_cover']['is_simulated'] is True
    assert result['uses_simulated_data'] is True
