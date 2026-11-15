"""Pruebas del chequeo 'otbn' con geometrías sintéticas (sin red ni capa real)."""

import datetime
import json
from pathlib import Path

import pytest

from events.models import Event, EventType, Sensor
from lots.models import Lot
from territory.checks import otbn
from territory.result import CheckStatus

# Lote de unos 1 km x 1,1 km cerca de Casilda
LOT = {
    'type': 'Polygon',
    'coordinates': [
        [[-61.2, -33.0], [-61.19, -33.0], [-61.19, -33.01], [-61.2, -33.01], [-61.2, -33.0]]
    ],
}


def _square(lon0: float, lat0: float, lon1: float, lat1: float) -> dict:
    return {
        'type': 'Polygon',
        'coordinates': [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]],
    }


def _write_layer(tmp_path: Path, features: list[tuple[str, dict]]) -> Path:
    path = tmp_path / 'otbn.geojson'
    path.write_text(
        json.dumps(
            {
                'type': 'FeatureCollection',
                'properties': {'clip_bbox_lat_lon': [-33.8, -62.3, -32.3, -60.3]},
                'features': [
                    {'type': 'Feature', 'properties': {'category': c}, 'geometry': g}
                    for c, g in features
                ],
            }
        )
    )
    return path


@pytest.fixture
def use_layer(monkeypatch):
    def _use(path: Path) -> None:
        monkeypatch.setattr(otbn, 'LAYER_PATH', path)

    yield _use
    otbn.load_layer.cache_clear()


# Cubre la mitad oeste del lote (categoría II)
HALF_WEST = _square(-61.21, -33.0, -61.195, -33.01)
# A unos 9 km al este del lote (categoría I)
FAR_EAST = _square(-61.10, -33.0, -61.09, -33.01)


@pytest.mark.django_db
def test_without_layer_returns_no_data(tmp_path, use_layer):
    use_layer(tmp_path / 'no_existe.geojson')
    lot = Lot.objects.create(name='Sin capa', geometry=LOT)
    result = otbn.run(lot)
    assert result.status == CheckStatus.NO_DATA
    assert 'capa' in result.summary


@pytest.mark.django_db
def test_no_overlap_is_clear_with_distance(tmp_path, use_layer):
    use_layer(_write_layer(tmp_path, [('I', FAR_EAST)]))
    lot = Lot.objects.create(name='Lejos', geometry=LOT)
    result = otbn.run(lot)
    assert result.status == CheckStatus.CLEAR
    assert result.details['overlap']['I']['ha'] == 0
    assert 8_000 < result.details['nearest_protected_m'] < 9_000
    assert result.details['strong_alert'] is False


@pytest.mark.django_db
def test_overlap_without_change_is_soft_conflict(tmp_path, use_layer):
    use_layer(_write_layer(tmp_path, [('II', HALF_WEST)]))
    lot = Lot.objects.create(name='Mitad', geometry=LOT)
    result = otbn.run(lot)
    assert result.status == CheckStatus.POSSIBLE_CONFLICT
    assert result.details['strong_alert'] is False
    assert 'no se detectó cambio de uso' in result.summary
    assert result.details['overlap']['II']['pct'] == pytest.approx(50, abs=1)
    assert result.details['nearest_protected_m'] == 0
    assert result.details['overlap_geojson']['features'][0]['properties']['category'] == 'II'


@pytest.mark.django_db
def test_overlap_with_land_use_change_event_is_strong_alert(tmp_path, use_layer):
    use_layer(_write_layer(tmp_path, [('II', HALF_WEST)]))
    lot = Lot.objects.create(name='Desmonte', geometry=LOT)
    Event.objects.create(
        lot=lot,
        type=EventType.LAND_USE_CHANGE,
        date=datetime.date(2024, 3, 1),
        sensor=Sensor.LANDSAT,
        origin='VERIFIED',
    )
    result = otbn.run(lot)
    assert result.status == CheckStatus.POSSIBLE_CONFLICT
    assert result.details['strong_alert'] is True
    assert result.details['land_use_change_detected'] is True
    assert 'posible desmonte' in result.summary


@pytest.mark.django_db
def test_overlap_with_declared_change_is_strong_alert(tmp_path, use_layer):
    use_layer(_write_layer(tmp_path, [('I', HALF_WEST)]))
    lot = Lot.objects.create(name='Declarado', geometry=LOT, land_use_unchanged=False)
    result = otbn.run(lot)
    assert result.details['strong_alert'] is True
    assert result.details['land_use_change_declared'] is True
    assert result.details['land_use_change_detected'] is False


@pytest.mark.django_db
def test_lot_outside_coverage_returns_no_data(tmp_path, use_layer):
    use_layer(_write_layer(tmp_path, [('I', FAR_EAST)]))
    lot = Lot.objects.create(name='Córdoba', geometry=_square(-64.2, -31.4, -64.19, -31.41))
    assert otbn.run(lot).status == CheckStatus.NO_DATA
