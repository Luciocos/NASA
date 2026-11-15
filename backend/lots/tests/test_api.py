import importlib

import pytest
from django.apps import apps
from django.contrib.auth.models import User
from django.test import Client

from lots.models import Campaign, Lot

# Datos armados para la prueba: no representan un lote real.
SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [
            [-61.20, -33.05],
            [-61.19, -33.05],
            [-61.19, -33.04],
            [-61.20, -33.04],
            [-61.20, -33.05],
        ]
    ],
}


@pytest.fixture
def lot(owner: User) -> Lot:
    lot = Lot.objects.create(
        name='Lote de prueba', locality='Casilda', geometry=SQUARE, owner=owner
    )
    Campaign.objects.create(lot=lot, label='2025/26', crop='SOY', crop_origin='DECLARED')
    return lot


@pytest.fixture
def example(db) -> Lot:
    return Lot.objects.create(name='Lote de ejemplo', geometry=SQUARE, public_example=True)


@pytest.mark.django_db
def test_lista_de_lotes_incluye_geometria_y_area(owner_client: Client, lot: Lot) -> None:
    response = owner_client.get('/api/lots/')
    assert response.status_code == 200
    [item] = response.json()
    assert item['id'] == lot.pk
    assert item['geometry'] == SQUARE
    assert item['area_ha'] == pytest.approx(lot.area_ha)
    assert item['event_count'] == 0
    assert item['is_example'] is False
    assert item['owned'] is True
    assert 'campaigns' not in item
    assert 'owner' not in item


@pytest.mark.django_db
def test_lista_exige_token(client: Client, lot: Lot) -> None:
    assert client.get('/api/lots/').status_code == 401


@pytest.mark.django_db
def test_lista_trae_solo_los_lotes_propios(
    owner_client: Client, stranger: User, lot: Lot, example: Lot
) -> None:
    Lot.objects.create(name='Lote ajeno', geometry=SQUARE, owner=stranger)
    assert [item['id'] for item in owner_client.get('/api/lots/').json()] == [lot.pk]


@pytest.mark.django_db
def test_ficha_incluye_campanias(owner_client: Client, lot: Lot) -> None:
    response = owner_client.get(f'/api/lots/{lot.pk}/')
    assert response.status_code == 200
    data = response.json()
    assert data['name'] == 'Lote de prueba'
    assert data['owned'] is True
    [campaign] = data['campaigns']
    assert campaign['label'] == '2025/26'
    assert campaign['crop'] == 'SOY'
    assert campaign['crop_label'] == 'Soja'
    assert campaign['crop_origin'] == 'DECLARED'


@pytest.mark.django_db
def test_ficha_inexistente_da_404(owner_client: Client) -> None:
    assert owner_client.get('/api/lots/999999/').status_code == 404


@pytest.mark.django_db
def test_ficha_ajena_da_el_mismo_404_que_una_inexistente(
    client: Client, stranger_client: Client, lot: Lot
) -> None:
    missing = stranger_client.get('/api/lots/999999/')
    foreign = stranger_client.get(f'/api/lots/{lot.pk}/')
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert client.get(f'/api/lots/{lot.pk}/').status_code == 404


@pytest.mark.django_db
def test_ejemplos_son_publicos(client: Client, lot: Lot, example: Lot) -> None:
    response = client.get('/api/examples/')
    assert response.status_code == 200
    [item] = response.json()
    assert item['id'] == example.pk
    assert item['is_example'] is True
    assert item['owned'] is False
    assert item['geometry'] == SQUARE
    detail = client.get(f'/api/lots/{example.pk}/')
    assert detail.status_code == 200
    assert detail.json()['is_example'] is True


@pytest.mark.django_db
def test_alta_de_lote_calcula_el_area(owner_client: Client, owner: User) -> None:
    response = owner_client.post(
        '/api/lots/',
        {'name': 'Lote nuevo', 'renspa': None, 'geometry': SQUARE},
        content_type='application/json',
    )
    assert response.status_code == 201, response.json()
    data = response.json()
    assert data['area_ha'] > 0
    assert data['renspa'] == ''
    assert data['campaigns'] == []
    assert data['event_count'] == 0
    assert data['owned'] is True
    assert data['is_example'] is False
    lot = Lot.objects.get(pk=data['id'])
    assert lot.owner == owner
    assert lot.events.count() == 0


@pytest.mark.django_db
def test_alta_exige_token(client: Client) -> None:
    response = client.post(
        '/api/lots/', {'name': 'Lote nuevo', 'geometry': SQUARE}, content_type='application/json'
    )
    assert response.status_code == 401
    assert not Lot.objects.exists()


@pytest.mark.django_db
def test_alta_no_deja_elegir_duenio_ni_marcar_ejemplo(
    owner_client: Client, owner: User, stranger: User
) -> None:
    response = owner_client.post(
        '/api/lots/',
        {
            'name': 'Lote nuevo',
            'geometry': SQUARE,
            'owner': stranger.pk,
            'public_example': True,
            'is_example': True,
        },
        content_type='application/json',
    )
    assert response.status_code == 201
    lot = Lot.objects.get(pk=response.json()['id'])
    assert lot.owner == owner
    assert lot.public_example is False


@pytest.mark.django_db
def test_alta_ignora_area_enviada(owner_client: Client) -> None:
    response = owner_client.post(
        '/api/lots/',
        {'name': 'Lote nuevo', 'geometry': SQUARE, 'area_ha': 1},
        content_type='application/json',
    )
    assert response.status_code == 201
    assert response.json()['area_ha'] > 50


@pytest.mark.django_db
@pytest.mark.parametrize(
    'geometry',
    [
        {'type': 'Point', 'coordinates': [-61.2, -33.05]},
        {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]},
        {'type': 'Polygon', 'coordinates': [[[-200, 0], [-199, 0], [-199, 1], [-200, 0]]]},
        'no es geojson',
    ],
)
def test_alta_rechaza_geometria_invalida(owner_client: Client, geometry: object) -> None:
    response = owner_client.post(
        '/api/lots/',
        {'name': 'Lote malo', 'geometry': geometry},
        content_type='application/json',
    )
    assert response.status_code == 400
    assert 'geometry' in response.json()
    assert not Lot.objects.exists()


@pytest.mark.django_db
def test_alta_exige_nombre(owner_client: Client) -> None:
    response = owner_client.post(
        '/api/lots/', {'geometry': SQUARE}, content_type='application/json'
    )
    assert response.status_code == 400
    assert 'name' in response.json()


@pytest.mark.django_db
def test_migracion_marca_los_lotes_del_pipeline_como_ejemplos(owner: User) -> None:
    migration = importlib.import_module('lots.migrations.0003_mark_pipeline_examples')
    pipeline = Lot.objects.create(name='Lote 3', geometry=SQUARE)
    other = Lot.objects.create(name='Lote 5', geometry=SQUARE)
    own = Lot.objects.create(name='Lote 1', geometry=SQUARE, owner=owner)

    migration.mark_pipeline_examples(apps, None)

    pipeline.refresh_from_db()
    other.refresh_from_db()
    own.refresh_from_db()
    assert pipeline.public_example is True
    assert other.public_example is False
    assert own.public_example is False
