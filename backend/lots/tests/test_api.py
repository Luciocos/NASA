import pytest
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
def lot() -> Lot:
    lot = Lot.objects.create(name='Lote de prueba', locality='Casilda', geometry=SQUARE)
    Campaign.objects.create(lot=lot, label='2025/26', crop='SOY', crop_origin='DECLARED')
    return lot


@pytest.mark.django_db
def test_lista_de_lotes_incluye_geometria_y_area(client: Client, lot: Lot) -> None:
    response = client.get('/api/lots/')
    assert response.status_code == 200
    [item] = response.json()
    assert item['id'] == lot.pk
    assert item['geometry'] == SQUARE
    assert item['area_ha'] == pytest.approx(lot.area_ha)
    assert item['event_count'] == 0
    assert 'campaigns' not in item


@pytest.mark.django_db
def test_ficha_incluye_campanias(client: Client, lot: Lot) -> None:
    response = client.get(f'/api/lots/{lot.pk}/')
    assert response.status_code == 200
    data = response.json()
    assert data['name'] == 'Lote de prueba'
    [campaign] = data['campaigns']
    assert campaign['label'] == '2025/26'
    assert campaign['crop'] == 'SOY'
    assert campaign['crop_label'] == 'Soja'
    assert campaign['crop_origin'] == 'DECLARED'


@pytest.mark.django_db
def test_ficha_inexistente_da_404(client: Client) -> None:
    assert client.get('/api/lots/999999/').status_code == 404


@pytest.mark.django_db
def test_alta_de_lote_calcula_el_area(client: Client) -> None:
    response = client.post(
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
    assert Lot.objects.get(pk=data['id']).events.count() == 0


@pytest.mark.django_db
def test_alta_ignora_area_enviada(client: Client) -> None:
    response = client.post(
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
def test_alta_rechaza_geometria_invalida(client: Client, geometry: object) -> None:
    response = client.post(
        '/api/lots/',
        {'name': 'Lote malo', 'geometry': geometry},
        content_type='application/json',
    )
    assert response.status_code == 400
    assert 'geometry' in response.json()
    assert not Lot.objects.exists()


@pytest.mark.django_db
def test_alta_exige_nombre(client: Client) -> None:
    response = client.post('/api/lots/', {'geometry': SQUARE}, content_type='application/json')
    assert response.status_code == 400
    assert 'name' in response.json()
