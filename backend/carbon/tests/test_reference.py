"""Valores de referencia: completan solo lo que falta y quedan rotulados con su fuente."""

from carbon.config import load_factors
from carbon.footprint import compute_footprint
from carbon.reference import load_references, parse_references, with_references
from carbon.tests.conftest import make_campaign, make_lot
from core.origin import Origin

# Referencias armadas para la prueba: los números son ficticios.
FAKE = parse_references(
    {
        'yield_t_ha': {'source': 'Fuente ficticia de rendimiento', 'values': {'SOY': 3.0}},
        'inputs': {
            'SEED': {
                'unit': 'kg/ha',
                'source': 'Fuente ficticia de semilla',
                'values': {'SOY': 80},
            },
            'PESTICIDE': {'unit': 'kg/ha', 'source': '', 'values': {'SOY': 1}},
        },
    }
)


def test_completa_lo_que_falta_como_estimado_con_fuente() -> None:
    lot = with_references(
        make_lot([make_campaign(yield_t_ha=None, yield_origin='', inputs=())]), FAKE
    )
    campaign = lot.campaigns[0]
    assert campaign.yield_t_ha == 3.0
    assert campaign.yield_origin == Origin.ESTIMATED
    assert campaign.yield_reference == 'Fuente ficticia de rendimiento'
    [seed] = campaign.inputs
    assert (seed.category, seed.quantity, seed.origin) == ('SEED', 80, Origin.ESTIMATED)
    assert seed.reference == 'Fuente ficticia de semilla'


def test_una_referencia_sin_fuente_no_se_usa() -> None:
    lot = with_references(make_lot([make_campaign(inputs=())]), FAKE)
    assert 'PESTICIDE' not in {i.category for i in lot.campaigns[0].inputs}


def test_no_pisa_datos_declarados() -> None:
    lot = with_references(make_lot([make_campaign()]), FAKE)
    campaign = lot.campaigns[0]
    assert campaign.yield_t_ha == 4.0 and campaign.yield_reference is None
    seeds = [i for i in campaign.inputs if i.category == 'SEED']
    assert len(seeds) == 1 and seeds[0].origin == 'DECLARED' and seeds[0].reference is None


def test_cultivo_sin_referencia_queda_igual() -> None:
    campaign = make_campaign(crop='OTHER', yield_t_ha=None, inputs=())
    assert with_references(make_lot([campaign]), FAKE).campaigns[0] == campaign


def test_la_huella_expone_la_fuente_de_la_referencia() -> None:
    lot = with_references(make_lot([make_campaign(yield_t_ha=None, inputs=())]), FAKE)
    data = compute_footprint(lot, lot.campaigns[0], load_factors())
    assert data['yield']['reference'] == 'Fuente ficticia de rendimiento'
    seed = next(c for c in data['components'] if c['key'] == 'seed')
    assert seed['activity']['reference'] == 'Fuente ficticia de semilla'
    assert seed['activity']['origin'] == Origin.ESTIMATED


def test_reference_values_yaml_tiene_fuente_en_cada_valor() -> None:
    refs = load_references()
    assert refs.yields, 'reference_values.yaml no tiene rendimientos'
    for value in refs.yields.values():
        assert value.source
    for by_crop in refs.inputs.values():
        for value in by_crop.values():
            assert value.source and value.unit


def test_semilla_usa_el_factor_del_cultivo() -> None:
    factors = load_factors()
    lot = make_lot([make_campaign(crop='CORN')])
    data = compute_footprint(lot, lot.campaigns[0], factors)
    seed = next(c for c in data['components'] if c['key'] == 'seed')
    assert seed['factor']['key'] == 'seed_corn'
