"""API de declaración del productor. Los números son ficticios, armados para la prueba."""

import datetime

import pytest
from django.contrib.auth.models import User
from django.test import Client

from carbon.models import InputRecord
from core.access import EXAMPLE_READ_ONLY
from core.origin import Origin
from events.models import Event
from lots.models import Campaign, Lot

GEOMETRY = {
    'type': 'Polygon',
    'coordinates': [[[-61.2, -33.05], [-61.19, -33.05], [-61.19, -33.04], [-61.2, -33.05]]],
}


@pytest.fixture
def lot(owner: User) -> Lot:
    return Lot.objects.create(name='Lote de prueba', geometry=GEOMETRY, owner=owner)


def post(client: Client, lot: Lot, body: dict):
    return client.post(f'/api/lots/{lot.pk}/declaration/', body, content_type='application/json')


@pytest.mark.django_db
def test_crea_campana_y_declara_insumos(owner_client: Client, lot: Lot) -> None:
    # Con al menos un evento importado se sabe que no hubo cambio de uso (aporte 0)
    Event.objects.create(
        lot=lot, type='SOWING', date=datetime.date(2026, 9, 7), sensor='NISAR', origin='VERIFIED'
    )
    response = post(
        owner_client,
        lot,
        {
            'campaign': '2026/27',
            'crop': 'CORN',
            'yield_t_ha': 9.0,
            'inputs': {'FERTILIZER_N': 100, 'FERTILIZER_P': 20, 'DIESEL': 40},
        },
    )
    assert response.status_code == 200
    campaign = Campaign.objects.get(lot=lot, label='2026/27')
    assert campaign.crop_origin == Origin.DECLARED
    assert campaign.yield_origin == Origin.DECLARED
    assert InputRecord.objects.filter(campaign=campaign, origin=Origin.DECLARED).count() == 3
    data = response.json()
    assert data['yield']['value'] == 9.0 and data['yield']['reference'] is None
    # Con N, P y gasoil declarados y semilla y fitosanitarios de referencia, se calcula
    assert data['complete'] is True
    assert data['total_kg_co2e_per_t'] > 0
    by_key = {c['key']: c for c in data['components']}
    assert by_key['diesel']['activity']['origin'] == Origin.DECLARED
    assert by_key['seed']['activity']['origin'] == Origin.ESTIMATED
    assert by_key['seed']['activity']['reference']


@pytest.mark.django_db
def test_redeclarar_reemplaza_y_null_vuelve_a_la_referencia(owner_client: Client, lot: Lot) -> None:
    post(owner_client, lot, {'campaign': '2026/27', 'crop': 'SOY', 'inputs': {'SEED': 70}})
    post(owner_client, lot, {'campaign': '2026/27', 'inputs': {'SEED': 75}})
    campaign = Campaign.objects.get(lot=lot)
    assert list(campaign.inputs.values_list('quantity', flat=True)) == [75]
    data = post(owner_client, lot, {'campaign': '2026/27', 'inputs': {'SEED': None}}).json()
    assert not campaign.inputs.exists()
    seed = next(c for c in data['components'] if c['key'] == 'seed')
    assert seed['activity']['origin'] == Origin.ESTIMATED


@pytest.mark.django_db
def test_valida_los_datos(owner_client: Client, lot: Lot) -> None:
    response = post(
        owner_client,
        lot,
        {
            'campaign': '26/27',
            'crop': 'RICE',
            'yield_t_ha': -1,
            'inputs': {'UREA': 10, 'DIESEL': 'x'},
        },
    )
    assert response.status_code == 400
    errors = response.json()
    assert {'campaign', 'crop', 'yield_t_ha', 'inputs.UREA', 'inputs.DIESEL'} <= set(errors)
    assert not Campaign.objects.exists()


@pytest.mark.django_db
def test_crear_campana_exige_cultivo(owner_client: Client, lot: Lot) -> None:
    response = post(owner_client, lot, {'campaign': '2026/27', 'yield_t_ha': 3})
    assert response.status_code == 400
    assert 'crop' in response.json()


DECLARATION = {'campaign': '2026/27', 'crop': 'SOY', 'inputs': {'SEED': 70}}


@pytest.mark.django_db
def test_declarar_en_un_ejemplo_da_403_y_no_guarda(owner_client: Client) -> None:
    example = Lot.objects.create(name='Lote de ejemplo', geometry=GEOMETRY, public_example=True)
    response = post(owner_client, example, DECLARATION)
    assert response.status_code == 403
    assert response.json() == {'detail': EXAMPLE_READ_ONLY}
    assert not Campaign.objects.exists()


@pytest.mark.django_db
def test_declarar_en_un_lote_ajeno_da_404_y_no_guarda(
    client: Client, stranger_client: Client, lot: Lot
) -> None:
    response = post(stranger_client, lot, DECLARATION)
    assert response.status_code == 404
    assert response.json() == post(stranger_client, Lot(pk=999999), DECLARATION).json()
    assert post(client, lot, DECLARATION).status_code == 401
    assert not Campaign.objects.exists()
