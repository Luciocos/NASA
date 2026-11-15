"""Pruebas del chequeo de distancias de exclusión periurbanas (sin red ni base de datos)."""

import json

import pytest
from pyproj import Transformer
from shapely.geometry import box, mapping, shape

from lots.models import Lot
from territory.checks import periurban
from territory.result import CheckStatus

TO_WGS = Transformer.from_crs('EPSG:32720', 'EPSG:4326', always_xy=True).transform

# Origen arbitrario en UTM 20S, cerca de Casilda.
X0, Y0 = 570_000.0, 6_340_000.0
URBAN = box(X0, Y0, X0 + 2_000, Y0 + 2_000)  # pueblo cuadrado de 2 x 2 km


def lot_at(x_min: float, width: float = 1_000, height: float = 1_000) -> Lot:
    """Lote rectangular al este del pueblo, a partir de x_min metros del origen."""
    utm = box(X0 + x_min, Y0, X0 + x_min + width, Y0 + height)
    ring = [list(TO_WGS(x, y)) for x, y in utm.exterior.coords]
    return Lot(name='Sintético', geometry={'type': 'Polygon', 'coordinates': [ring]})


def make_rule(
    terrestrial: float | None = 500, aerial: float | None = 3000, validated: bool = True
) -> periurban.Rule:
    return periurban.Rule(
        locality='Pueblo',
        province='Santa Fe',
        norm='Ley de prueba',
        norm_date='1995-09-28',
        url='https://example.org/ley',
        publisher='Prueba',
        article_terrestrial='Art. 34',
        article_aerial='Art. 33',
        terrestrial_m=terrestrial,
        aerial_m=aerial,
        validated=validated,
        municipal_ordinance=None,
    )


@pytest.fixture
def layers(monkeypatch):
    def apply(rule: periurban.Rule | None, areas: bool = True) -> None:
        urban = [periurban.UrbanArea(name='Pueblo', geometry=URBAN, downloaded='2026-11-15')]
        monkeypatch.setattr(periurban, 'load_urban_areas', lambda: urban if areas else [])
        monkeypatch.setattr(periurban, 'load_rules', lambda: {'Pueblo': rule} if rule else {})

    return apply


def test_no_layer_returns_no_data(layers):
    layers(make_rule(), areas=False)
    assert periurban.run(lot_at(3_000)).status == CheckStatus.NO_DATA


def test_missing_rule_returns_no_data(layers):
    layers(None)
    result = periurban.run(lot_at(3_000))
    assert result.status == CheckStatus.NO_DATA
    assert result.details['locality'] == 'Pueblo'


def test_unvalidated_distance_returns_no_data(layers):
    layers(make_rule(terrestrial=None, aerial=None, validated=False))
    assert periurban.run(lot_at(3_000)).status == CheckStatus.NO_DATA


def test_validated_flag_false_returns_no_data(layers):
    layers(make_rule(validated=False))
    assert periurban.run(lot_at(3_000)).status == CheckStatus.NO_DATA


def test_lot_far_away_is_clear(layers):
    layers(make_rule())
    # El pueblo termina en x=2000; el lote empieza 4000 m después.
    result = periurban.run(lot_at(6_000))
    assert result.status == CheckStatus.CLEAR
    assert result.details['distance_to_urban_m'] == pytest.approx(4_000, abs=2)
    assert result.details['aerial_overlap_ha'] == 0
    assert result.details['terrestrial_overlap_ha'] == 0


def test_lot_partly_in_aerial_band(layers):
    layers(make_rule())
    # Lote de x=4500 a x=5500 (2500 a 3500 m del pueblo): la mitad cae en los 3000 m.
    result = periurban.run(lot_at(4_500))
    d = result.details
    assert result.status == CheckStatus.POSSIBLE_CONFLICT
    assert d['terrestrial_overlap_ha'] == 0
    assert d['aerial_overlap_pct'] == pytest.approx(50, abs=1)
    assert d['aerial_overlap_ha'] == pytest.approx(50, abs=1)
    assert d['terrestrial_buffer_m'] == 500
    assert d['aerial_buffer_m'] == 3000
    assert d['geometry']['aerial']['type'] in {'Polygon', 'MultiPolygon'}
    # La franja de 500 m queda fuera del recorte de visualización (1500 m del lote).
    assert d['geometry']['terrestrial'] is None
    assert [s.name for s in result.sources][0] == 'Ley de prueba'


def test_lot_partly_in_terrestrial_band(layers):
    layers(make_rule())
    # Lote de x=2200 a x=3200 (200 a 1200 m): 300 m de 1000 caen en los 500 m.
    result = periurban.run(lot_at(2_200))
    d = result.details
    assert result.status == CheckStatus.POSSIBLE_CONFLICT
    assert d['terrestrial_overlap_pct'] == pytest.approx(30, abs=1)
    assert d['aerial_overlap_pct'] == pytest.approx(100, abs=0.5)
    assert 'terrestre' in result.summary


def test_result_is_serializable(layers):
    layers(make_rule())
    json.dumps(periurban.run(lot_at(2_200)).to_dict())


def test_real_rules_file_has_verified_source():
    """El rules.yaml del repo solo puede tener distancias con fuente y validated."""
    periurban.load_rules.cache_clear()
    rules = periurban.load_rules()
    for rule in rules.values():
        if rule.terrestrial_m is not None or rule.aerial_m is not None:
            assert rule.validated
            assert rule.url.startswith('https://')
            assert rule.article_terrestrial and rule.article_aerial


def test_geometry_helpers_roundtrip():
    geojson = periurban.to_wgs84_geojson(URBAN)
    assert geojson is not None
    back = periurban.to_utm(shape(geojson))
    assert back.symmetric_difference(URBAN).area < 1_000
    assert mapping(back)['type'] == 'Polygon'
