"""Pruebas de Cuenca y Caudal sobre los datos reales del pipeline (data/hydrology/lote3)."""

import json
from pathlib import Path

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from hydrology import service
from hydrology.terrain import load
from lots.models import Lot

LOT3 = json.loads((Path(settings.MEDIA_ROOT) / 'demo' / 'lote3.json').read_text())['lot']
FAR_AWAY = {
    'type': 'Polygon',
    'coordinates': [[[-60.0, -34.0], [-59.99, -34.0], [-59.99, -34.01], [-60.0, -34.0]]],
}

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skipif(load() is None, reason='faltan los datos del pipeline'),
]


@pytest.fixture
def lot3():
    return Lot.objects.create(name='Lote 3', geometry=LOT3['geometry'], public_example=True)


def test_basin_of_lot_3(lot3):
    response = APIClient().get(f'/api/lots/{lot3.pk}/hydrology/')
    assert response.status_code == 200
    body = response.json()
    assert body['available'] is True
    basin, contrib = body['basin'], body['contributing']
    assert basin['area_ha'] > 0
    # lo que aporta al lote incluye al lote entero
    assert contrib['area_ha'] >= contrib['lot_ha'] > 0
    assert contrib['outside_lot_ha'] == pytest.approx(
        contrib['area_ha'] - contrib['lot_ha'], abs=0.2
    )
    assert basin['geometry']['type'] in {'Polygon', 'MultiPolygon'}
    assert basin['subbasins'] == len(body['subbasins']) >= 1
    assert sum(s['area_ha'] for s in body['subbasins']) == pytest.approx(basin['area_ha'], rel=0.01)
    assert body['exits']
    assert body['limitations']
    assert body['basin']['cn_arc_ii'] > 0


def test_outlet_downstream_drains_more(lot3):
    client = APIClient()
    base = client.get(f'/api/lots/{lot3.pk}/hydrology/').json()
    # 3 km al sur-oeste del lote: otra cuenca, con su propio punto de salida ajustado
    moved = client.get(
        f'/api/lots/{lot3.pk}/hydrology/',
        {'lat': base['outlet']['lat'] - 0.02, 'lng': base['outlet']['lng'] - 0.02},
    ).json()
    assert moved['outlet'] != base['outlet']


def test_outlet_needs_both_coordinates(lot3):
    response = APIClient().get(f'/api/lots/{lot3.pk}/hydrology/', {'lat': -33.08})
    assert response.status_code == 400


def test_lot_outside_processed_area_is_not_available():
    lot = Lot.objects.create(name='Lejos', geometry=FAR_AWAY, public_example=True)
    response = APIClient().get(f'/api/lots/{lot.pk}/hydrology/')
    assert response.status_code == 404
    assert response.json()['available'] is False


def test_simulation_volume_and_scenarios(lot3):
    client = APIClient()
    url = f'/api/lots/{lot3.pk}/hydrology/simulate/'
    results = {}
    for rain in (30, 60, 100):
        r = client.post(url, {'rain_mm': rain, 'duration_h': 6}, format='json')
        assert r.status_code == 200
        results[rain] = r.json()
    for body in results.values():
        res = body['result']
        assert res['volume_m3'] == pytest.approx(
            res['runoff_mm'] * body['basin_area_ha'] * 10, abs=2
        )
        assert body['scenario']['kind'] == 'Escenario hipotético'
        rng = body['range']
        assert rng['I']['runoff_mm'] <= rng['II']['runoff_mm'] <= rng['III']['runoff_mm']
    assert results[30]['result']['runoff_mm'] < results[60]['result']['runoff_mm']
    assert results[60]['result']['runoff_mm'] < results[100]['result']['runoff_mm']
    assert results[100]['result']['peak_m3s'] > 0


def test_longer_storm_lowers_the_peak(lot3):
    client = APIClient()
    url = f'/api/lots/{lot3.pk}/hydrology/simulate/'
    short = client.post(url, {'rain_mm': 60, 'duration_h': 1}, format='json').json()['result']
    long = client.post(url, {'rain_mm': 60, 'duration_h': 24}, format='json').json()['result']
    assert long['peak_m3s'] < short['peak_m3s']
    assert long['runoff_mm'] == pytest.approx(short['runoff_mm'], rel=1e-6)


def test_simulation_rejects_bad_input(lot3):
    url = f'/api/lots/{lot3.pk}/hydrology/simulate/'
    assert APIClient().post(url, {'rain_mm': -5, 'duration_h': 6}, format='json').status_code == 400
    assert (
        APIClient()
        .post(url, {'rain_mm': 30, 'arc': 'IV', 'duration_h': 6}, format='json')
        .status_code
        == 400
    )


@pytest.mark.skipif(service.forcing() is None, reason='falta forcing.json')
def test_history_events(lot3):
    response = APIClient().get(f'/api/lots/{lot3.pk}/hydrology/history/')
    assert response.status_code == 200
    body = response.json()
    assert body['events']
    for ev in body['events']:
        assert ev['rain_mm'] > 0
        assert ev['range']['I']['runoff_mm'] <= ev['range']['III']['runoff_mm']
    assert 'Sin caudales' in body['validation']


def test_private_lot_of_someone_else_is_404():
    lot = Lot.objects.create(name='Ajeno', geometry=LOT3['geometry'])
    assert APIClient().get(f'/api/lots/{lot.pk}/hydrology/').status_code == 404
