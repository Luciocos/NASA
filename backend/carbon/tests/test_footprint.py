"""Pruebas del cálculo de huella. Los números son ficticios (ver conftest.py)."""

from dataclasses import replace

import pytest

from carbon.config import parse_factors
from carbon.data import InputData
from carbon.footprint import (
    CONFIDENCE_HIGH,
    CONFIDENCE_LOW,
    CONFIDENCE_NONE,
    compute_footprint,
    confidence,
)
from carbon.tests.conftest import FAKE_SOURCE, make_campaign, make_event, make_lot


def by_key(result: dict) -> dict[str, dict]:
    return {c['key']: c for c in result['components']}


def test_calcula_la_huella_por_tonelada_con_datos_completos(fake_factors) -> None:
    lot = make_lot()
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)

    components = by_key(result)
    # Por hectárea: N 10x2 + P 20x1 + N2O 10x3 + gasoil 4x10 + fito 2x5 + semilla 60x0,5 = 150.
    assert components['fertilizer_n_production']['kg_co2e_per_ha'] == 20
    assert components['soil_n2o']['kg_co2e_per_ha'] == 30
    assert components['diesel']['kg_co2e_per_t'] == pytest.approx(10)
    assert components['land_use_change']['kg_co2e_per_ha'] == 0
    assert result['complete'] is True
    assert result['missing_components'] == []
    assert result['message'] is None
    assert result['total_kg_co2e_per_t'] == pytest.approx(150 / 4)
    assert result['unit'] == 'kg CO2e/t'
    assert result['provisional'] is True


def test_con_factores_nulos_no_falla_y_todo_queda_sin_dato(null_factors) -> None:
    lot = make_lot()
    result = compute_footprint(lot, lot.campaigns[0], null_factors)

    assert result['complete'] is False
    assert result['total_kg_co2e_per_t'] is None
    assert result['message'].startswith('No se puede calcular todavía')
    for key, component in by_key(result).items():
        if key == 'land_use_change':
            continue
        assert component['status'] == 'sin_dato'
        assert 'factors.yaml' in component['reason']
        assert component['kg_co2e_per_ha'] is None
        # El dato de actividad y su origen se informan aunque falte el factor.
        assert component['activity']['records'] >= 1
        assert component['activity']['origin'] is not None


def test_factor_con_valor_pero_sin_validar_no_se_usa(fake_factors) -> None:
    factors = fake_factors | parse_factors(
        {'diesel': {'value': 1.0, 'unit': 'kg CO2e/l', 'source': FAKE_SOURCE, 'validated': False}}
    )
    lot = make_lot()
    diesel = by_key(compute_footprint(lot, lot.campaigns[0], factors))['diesel']
    assert diesel['status'] == 'sin_dato'
    assert 'no está validado' in diesel['reason']


def test_factor_validado_sin_fuente_no_se_usa(fake_factors) -> None:
    factors = fake_factors | parse_factors(
        {'seed': {'value': 1.0, 'unit': 'kg CO2e/kg', 'source': None, 'validated': True}}
    )
    lot = make_lot()
    seed = by_key(compute_footprint(lot, lot.campaigns[0], factors))['seed']
    assert seed['status'] == 'sin_dato'
    assert 'fuente' in seed['reason']


def test_factor_ausente_del_yaml_queda_sin_dato(fake_factors) -> None:
    factors = {k: v for k, v in fake_factors.items() if k != 'pesticides'}
    lot = make_lot()
    result = compute_footprint(lot, lot.campaigns[0], factors)
    assert by_key(result)['pesticides']['status'] == 'sin_dato'
    assert result['missing_components'] == ['pesticides']
    assert result['total_kg_co2e_per_t'] is None


def test_falta_de_insumo_deja_el_componente_sin_dato(fake_factors) -> None:
    campaign = make_campaign(
        inputs=(InputData('FERTILIZER_N', 10.0, 'kg/ha', 'DECLARED'),),
    )
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    components = by_key(result)
    assert components['fertilizer_n_production']['status'] == 'calculado'
    assert components['seed']['status'] == 'sin_dato'
    assert 'No hay insumos' in components['seed']['reason']
    assert set(result['missing_components']) == {
        'fertilizer_p_production',
        'diesel',
        'pesticides',
        'seed',
    }
    assert result['total_kg_co2e_per_t'] is None


def test_sin_rendimiento_no_hay_huella_por_tonelada(fake_factors) -> None:
    campaign = make_campaign(yield_t_ha=None, yield_origin='')
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    assert result['yield']['status'] == 'sin_dato'
    assert 'rendimiento' in result['yield']['reason']
    assert 'falta el rendimiento' in result['message']
    assert result['total_kg_co2e_per_t'] is None
    # Por hectárea se puede calcular; por tonelada no.
    assert by_key(result)['diesel']['kg_co2e_per_ha'] == 40
    assert by_key(result)['diesel']['kg_co2e_per_t'] is None


def test_rendimiento_cero_no_divide(fake_factors) -> None:
    campaign = make_campaign(yield_t_ha=0.0)
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    assert result['yield']['status'] == 'sin_dato'
    assert result['total_kg_co2e_per_t'] is None


def test_unidad_incompatible_queda_sin_dato(fake_factors) -> None:
    campaign = make_campaign(inputs=(InputData('DIESEL', 4.0, 'kg/ha', 'VERIFIED'),))
    diesel = by_key(compute_footprint(make_lot([campaign]), campaign, fake_factors))['diesel']
    assert diesel['status'] == 'sin_dato'
    assert 'Unidad incompatible' in diesel['reason']
    assert 'l/ha' in diesel['reason']


def test_suma_varios_registros_y_toma_el_origen_menos_respaldado(fake_factors) -> None:
    campaign = make_campaign(
        inputs=(
            InputData('DIESEL', 3.0, 'l/ha', 'VERIFIED'),
            InputData('DIESEL', 1.0, 'l / ha', 'ESTIMATED'),
        )
    )
    diesel = by_key(compute_footprint(make_lot([campaign]), campaign, fake_factors))['diesel']
    assert diesel['activity']['quantity'] == 4.0
    assert diesel['activity']['origins'] == ['VERIFIED', 'ESTIMATED']
    assert diesel['activity']['origin'] == 'ESTIMATED'
    assert diesel['kg_co2e_per_ha'] == 40


def test_cambio_de_uso_detectado_suma_al_total(fake_factors) -> None:
    lot = make_lot(events=[make_event('LAND_USE_CHANGE', '2021-03-01', 'VERIFIED')])
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)
    land_use = by_key(result)['land_use_change']
    assert land_use['activity']['detected'] is True
    assert land_use['activity']['origin'] == 'VERIFIED'
    assert land_use['kg_co2e_per_t'] == pytest.approx(1000 / 4)
    assert result['total_kg_co2e_per_t'] == pytest.approx((150 + 1000) / 4)


def test_cambio_de_uso_anterior_a_2020_no_cuenta(fake_factors) -> None:
    lot = make_lot(events=[make_event('LAND_USE_CHANGE', '2019-12-31')])
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], fake_factors))['land_use_change']
    assert land_use['activity']['detected'] is False
    assert land_use['kg_co2e_per_ha'] == 0


def test_cambio_de_uso_detectado_sin_factor_queda_sin_dato(null_factors) -> None:
    lot = make_lot(events=[make_event('LAND_USE_CHANGE', '2022-01-10', 'DECLARED')])
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], null_factors))['land_use_change']
    assert land_use['status'] == 'sin_dato'
    assert land_use['activity']['detected'] is True
    assert land_use['activity']['origin'] == 'DECLARED'


def test_ausencia_de_cambio_de_uso_es_dato_estimado(null_factors) -> None:
    lot = make_lot()
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], null_factors))['land_use_change']
    assert land_use['status'] == 'calculado'
    assert land_use['activity']['detected'] is False
    assert land_use['activity']['origin'] == 'ESTIMATED'
    assert 'inferida' in land_use['note']


def test_lote_sin_eventos_no_sabe_si_hubo_cambio_de_uso(fake_factors) -> None:
    lot = make_lot(events=[])
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)
    land_use = by_key(result)['land_use_change']
    assert land_use['status'] == 'sin_dato'
    assert land_use['activity']['detected'] is None
    assert result['total_kg_co2e_per_t'] is None


def test_declaracion_sin_cambio_de_uso_completa_el_total(fake_factors) -> None:
    # Lote dibujado por el productor: sin bitácora, pero declaró que no cambió el uso
    lot = replace(make_lot(events=[]), land_use_unchanged=True)
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)
    land_use = by_key(result)['land_use_change']
    assert land_use['status'] == 'calculado'
    assert land_use['kg_co2e_per_ha'] == 0
    assert land_use['activity']['origin'] == 'DECLARED'
    assert land_use['activity']['detected'] is False
    assert result['total_kg_co2e_per_t'] == pytest.approx(150 / 4)


def test_declaracion_de_cambio_de_uso_suma_con_factor(fake_factors) -> None:
    lot = replace(make_lot(events=[]), land_use_unchanged=False)
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)
    land_use = by_key(result)['land_use_change']
    assert land_use['activity']['origin'] == 'DECLARED'
    assert land_use['activity']['detected'] is True
    assert result['total_kg_co2e_per_t'] == pytest.approx((150 + 1000) / 4)


def test_declaracion_de_cambio_de_uso_sin_factor_queda_sin_dato(null_factors) -> None:
    lot = replace(make_lot(events=[]), land_use_unchanged=False)
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], null_factors))['land_use_change']
    assert land_use['status'] == 'sin_dato'
    assert land_use['activity']['detected'] is True


def test_evento_satelital_de_cambio_de_uso_manda_sobre_la_declaracion(fake_factors) -> None:
    lot = replace(
        make_lot(events=[make_event('LAND_USE_CHANGE', '2021-03-01', 'VERIFIED')]),
        land_use_unchanged=True,
    )
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], fake_factors))['land_use_change']
    assert land_use['activity']['origin'] == 'VERIFIED'
    assert land_use['activity']['detected'] is True


def test_declaracion_manda_sobre_la_ausencia_inferida(null_factors) -> None:
    lot = replace(make_lot(), land_use_unchanged=True)
    land_use = by_key(compute_footprint(lot, lot.campaigns[0], null_factors))['land_use_change']
    assert land_use['activity']['origin'] == 'DECLARED'


def test_lote_sin_campanias_no_falla(fake_factors) -> None:
    lot = make_lot(campaigns=[], events=[])
    result = compute_footprint(lot, None, fake_factors)
    assert result['campaign'] is None
    assert result['complete'] is False
    assert all(c['status'] == 'sin_dato' for c in result['components'])
    assert result['confidence']['level'] == CONFIDENCE_NONE


def test_confianza_alta_con_mayoria_verificada_o_declarada(fake_factors) -> None:
    lot = make_lot()
    result = compute_footprint(lot, lot.campaigns[0], fake_factors)
    # Rendimiento D, insumos D D V E D, ausencia de cambio de uso E.
    assert result['confidence']['counts'] == {'VERIFIED': 1, 'DECLARED': 4, 'ESTIMATED': 2}
    assert result['confidence']['level'] == CONFIDENCE_HIGH


def test_confianza_baja_si_predominan_estimados(fake_factors) -> None:
    campaign = make_campaign(
        yield_origin='ESTIMATED',
        inputs=(
            InputData('DIESEL', 4.0, 'l/ha', 'ESTIMATED'),
            InputData('SEED', 60.0, 'kg/ha', 'DECLARED'),
        ),
    )
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    assert result['confidence']['level'] == CONFIDENCE_LOW


def test_reglas_de_confianza() -> None:
    assert confidence([])['level'] == CONFIDENCE_NONE
    assert confidence(['VERIFIED', 'ESTIMATED'])['level'] == CONFIDENCE_LOW  # empate
    assert confidence(['VERIFIED', 'DECLARED', 'ESTIMATED'])['level'] == CONFIDENCE_HIGH
    assert confidence(['ESTIMATED'])['level'] == CONFIDENCE_LOW


def test_rendimiento_sin_origen_se_toma_como_estimado(fake_factors) -> None:
    campaign = make_campaign(yield_origin='')
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    assert result['yield']['origin'] == 'ESTIMATED'


def test_datos_simulados_se_marcan(fake_factors) -> None:
    campaign = make_campaign(
        inputs=(InputData('DIESEL', 4.0, 'l/ha', 'DECLARED', is_simulated=True),)
    )
    result = compute_footprint(make_lot([campaign]), campaign, fake_factors)
    assert by_key(result)['diesel']['is_simulated'] is True
    assert by_key(result)['seed']['is_simulated'] is False
    assert result['uses_simulated_data'] is True


def test_ausencia_inferida_de_bitacora_simulada_es_simulada(null_factors) -> None:
    lot = make_lot(events=[make_event('SOWING', is_simulated=True)])
    lot = replace(lot, campaigns=(make_campaign(inputs=()),))
    result = compute_footprint(lot, lot.campaigns[0], null_factors)
    assert by_key(result)['land_use_change']['is_simulated'] is True
    assert result['uses_simulated_data'] is True


def test_campania_por_id_o_etiqueta() -> None:
    older = make_campaign(id=7, label='2024/25')
    newer = make_campaign(id=8, label='2025/26')
    lot = make_lot([older, newer])
    assert lot.find_campaign(None) is newer
    assert lot.find_campaign('2024/25') is older
    assert lot.find_campaign('7') is older
    assert lot.find_campaign(8) is newer
    assert lot.find_campaign('2030/31') is None
