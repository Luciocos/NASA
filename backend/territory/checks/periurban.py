"""Chequeo: Distancias de exclusión periurbanas.

Cruza el lote con el área urbana de las localidades cercanas, ampliada por las distancias
que fija la norma para aplicar fitosanitarios (terrestre y aérea), y calcula qué parte del
lote cae dentro de cada franja.

Datos (offline, ver data/layers/periurban/README.md):
- rules.yaml: norma, artículo y distancias por localidad. Sin distancia validada: NO_DATA.
- urban_areas.geojson: áreas urbanas aproximadas con OpenStreetMap (no es el límite oficial
  de la planta urbana, que cada municipio fija por ordenanza).

El cálculo se hace en UTM 20S (EPSG:32720), métrica para la zona núcleo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import numpy as np
import shapely
import yaml
from django.conf import settings
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus, LayerSource

KEY = 'periurban'
TITLE = 'Distancias de exclusión periurbanas'

UTM_CRS = 'EPSG:32720'
# Margen alrededor del lote para recortar las franjas que se dibujan en el mapa. Es un
# parámetro de visualización, no de la norma.
VIEW_MARGIN_M = 1500.0
# Tolerancia de simplificación de las geometrías que se devuelven para dibujar.
DRAW_SIMPLIFY_M = 5.0
# Superficie mínima para considerar que hay superposición (evita ruido numérico).
MIN_OVERLAP_M2 = 1.0

_TO_UTM = Transformer.from_crs('EPSG:4326', UTM_CRS, always_xy=True).transform
_TO_WGS = Transformer.from_crs(UTM_CRS, 'EPSG:4326', always_xy=True).transform

OSM_SOURCE = LayerSource(
    name='Áreas urbanas aproximadas (landuse=residential)',
    publisher='© OpenStreetMap contributors',
    url='https://www.openstreetmap.org/copyright',
    license='ODbL 1.0',
)


@dataclass(frozen=True)
class Rule:
    locality: str
    province: str
    norm: str
    norm_date: str
    url: str
    publisher: str
    article_terrestrial: str
    article_aerial: str
    terrestrial_m: float | None
    aerial_m: float | None
    validated: bool
    municipal_ordinance: str | None

    @property
    def usable(self) -> bool:
        return self.validated and self.terrestrial_m is not None and self.aerial_m is not None


@dataclass(frozen=True)
class UrbanArea:
    name: str
    geometry: BaseGeometry  # en UTM
    downloaded: str


def data_dir() -> Path:
    return Path(settings.BASE_DIR).parent / 'data' / 'layers' / 'periurban'


def _project(geom: BaseGeometry, func: Any) -> BaseGeometry:
    return shapely.transform(geom, lambda c: np.column_stack(func(c[:, 0], c[:, 1])))


def to_utm(geom: BaseGeometry) -> BaseGeometry:
    return _project(geom, _TO_UTM)


def to_wgs84_geojson(geom: BaseGeometry) -> dict[str, Any] | None:
    if geom.is_empty:
        return None
    simplified = geom.simplify(DRAW_SIMPLIFY_M)
    return mapping(shapely.set_precision(_project(simplified, _TO_WGS), 1e-6))


@cache
def load_rules() -> dict[str, Rule]:
    """Reglas por nombre de localidad. Vacío si falta el archivo."""
    path = data_dir() / 'rules.yaml'
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    norms = raw.get('normas') or {}
    rules: dict[str, Rule] = {}
    for item in raw.get('localidades') or []:
        norm = {**norms.get(item.get('norma_ref'), {}), **item}
        rules[item['name']] = Rule(
            locality=item['name'],
            province=norm.get('provincia', ''),
            norm=norm.get('norma', ''),
            norm_date=str(norm.get('fecha', '')),
            url=norm.get('url', ''),
            publisher=norm.get('publisher', ''),
            article_terrestrial=norm.get('articulo_terrestre', ''),
            article_aerial=norm.get('articulo_aereo', ''),
            terrestrial_m=norm.get('distancia_terrestre_m'),
            aerial_m=norm.get('distancia_aerea_m'),
            validated=bool(norm.get('validated', False)),
            municipal_ordinance=norm.get('ordenanza_municipal'),
        )
    return rules


@cache
def load_urban_areas() -> list[UrbanArea]:
    """Áreas urbanas en UTM. Vacío si falta la capa."""
    path = data_dir() / 'urban_areas.geojson'
    if not path.exists():
        return []
    collection = json.loads(path.read_text(encoding='utf-8'))
    return [
        UrbanArea(
            name=feature['properties']['name'],
            geometry=to_utm(shape(feature['geometry'])),
            downloaded=feature['properties'].get('downloaded', ''),
        )
        for feature in collection.get('features', [])
    ]


def _no_data(summary: str, sources: list[LayerSource], **details: Any) -> CheckResult:
    return CheckResult(
        key=KEY,
        title=TITLE,
        status=CheckStatus.NO_DATA,
        summary=summary,
        origin=CheckOrigin.OFFICIAL_LAYER,
        sources=sources,
        details=details,
    )


def _norm_source(rule: Rule) -> LayerSource:
    return LayerSource(name=rule.norm, publisher=rule.publisher, url=rule.url, date=rule.norm_date)


def _fmt_ha(value: float) -> str:
    return f'{value:.1f}'.replace('.', ',')


def _fmt_m(value: float) -> str:
    return f'{round(value):,}'.replace(',', '.')


def run(lot: Lot) -> CheckResult:
    areas = load_urban_areas()
    rules = load_rules()
    osm_source = LayerSource(
        name=OSM_SOURCE.name,
        publisher=OSM_SOURCE.publisher,
        url=OSM_SOURCE.url,
        license=OSM_SOURCE.license,
        date=areas[0].downloaded if areas else '',
    )
    if not areas:
        return _no_data('Falta la capa de áreas urbanas de la zona.', [])

    lot_geom = to_utm(shape(lot.geometry))
    lot_area_m2 = lot_geom.area
    nearest = min(areas, key=lambda a: a.geometry.distance(lot_geom))
    distance_m = nearest.geometry.distance(lot_geom)
    rule = rules.get(nearest.name)

    if rule is None or not rule.usable:
        sources = [osm_source] + ([_norm_source(rule)] if rule else [])
        return _no_data(
            f'No hay una distancia de exclusión verificada para {nearest.name}: falta leerla '
            'en la norma original.',
            sources,
            locality=nearest.name,
            distance_to_urban_m=round(distance_m),
        )

    # Franjas: unión de los buffers de todas las localidades con regla validada, para que
    # un lote entre dos pueblos no cuente dos veces la misma superficie.
    terrestrial_parts: list[BaseGeometry] = []
    aerial_parts: list[BaseGeometry] = []
    involved: list[dict[str, Any]] = []
    used_rules: dict[str, Rule] = {}
    for area in areas:
        area_rule = rules.get(area.name)
        if area_rule is None or not area_rule.usable:
            continue
        assert area_rule.terrestrial_m is not None and area_rule.aerial_m is not None
        dist = area.geometry.distance(lot_geom)
        if dist > area_rule.aerial_m + VIEW_MARGIN_M:
            continue
        terrestrial_parts.append(area.geometry.buffer(area_rule.terrestrial_m))
        aerial_parts.append(area.geometry.buffer(area_rule.aerial_m))
        used_rules[area_rule.norm] = area_rule
        involved.append({'locality': area.name, 'distance_to_urban_m': round(dist)})

    terrestrial_zone = unary_union(terrestrial_parts)
    aerial_zone = unary_union(aerial_parts)

    bands = []
    for band_key, label, zone, buffer_m in (
        ('terrestrial', 'Aplicación terrestre', terrestrial_zone, rule.terrestrial_m),
        ('aerial', 'Aplicación aérea', aerial_zone, rule.aerial_m),
    ):
        overlap_m2 = lot_geom.intersection(zone).area if not zone.is_empty else 0.0
        if overlap_m2 < MIN_OVERLAP_M2:
            overlap_m2 = 0.0
        bands.append(
            {
                'key': band_key,
                'label': label,
                'buffer_m': buffer_m,
                'overlap_ha': round(overlap_m2 / 10_000, 2),
                'overlap_pct': round(100 * overlap_m2 / lot_area_m2, 1) if lot_area_m2 else 0.0,
            }
        )
    terrestrial, aerial = bands

    view = box(*lot_geom.bounds).buffer(VIEW_MARGIN_M, join_style='mitre')
    urban_view = unary_union([a.geometry for a in areas]).intersection(view)
    details: dict[str, Any] = {
        'locality': nearest.name,
        'province': rule.province,
        'distance_to_urban_m': round(distance_m),
        'terrestrial_buffer_m': rule.terrestrial_m,
        'aerial_buffer_m': rule.aerial_m,
        'lot_area_ha': round(lot_area_m2 / 10_000, 2),
        'terrestrial_overlap_ha': terrestrial['overlap_ha'],
        'terrestrial_overlap_pct': terrestrial['overlap_pct'],
        'aerial_overlap_ha': aerial['overlap_ha'],
        'aerial_overlap_pct': aerial['overlap_pct'],
        'bands': bands,
        'localities': involved,
        'norm': {
            'name': rule.norm,
            'date': rule.norm_date,
            'url': rule.url,
            'article_terrestrial': rule.article_terrestrial,
            'article_aerial': rule.article_aerial,
            'municipal_ordinance': rule.municipal_ordinance,
        },
        'urban_boundary_note': (
            'El área urbana es una aproximación con OpenStreetMap. El límite legal de la '
            'planta urbana lo fija cada municipio o comuna por ordenanza.'
        ),
        'view_margin_m': VIEW_MARGIN_M,
        'geometry': {
            'urban': to_wgs84_geojson(urban_view),
            'terrestrial': to_wgs84_geojson(terrestrial_zone.intersection(view)),
            'aerial': to_wgs84_geojson(aerial_zone.intersection(view)),
        },
    }

    distance_text = (
        'El lote toca el área urbana'
        if distance_m < 1
        else f'El lote está a {_fmt_m(distance_m)} m del área urbana'
    )
    if aerial['overlap_ha'] > 0 or terrestrial['overlap_ha'] > 0:
        status = CheckStatus.POSSIBLE_CONFLICT
        parts = []
        if terrestrial['overlap_ha'] > 0:
            parts.append(
                f'{_fmt_ha(terrestrial["overlap_ha"])} ha '
                f'({_fmt_ha(terrestrial["overlap_pct"])} %) dentro de los '
                f'{_fmt_m(rule.terrestrial_m)} m (terrestre)'
            )
        parts.append(
            f'{_fmt_ha(aerial["overlap_ha"])} ha ({_fmt_ha(aerial["overlap_pct"])} %) dentro '
            f'de los {_fmt_m(rule.aerial_m)} m (aérea)'
        )
        summary = (
            f'{distance_text} de {nearest.name}. Tiene {" y ".join(parts)} donde la norma '
            'restringe aplicar fitosanitarios de clase toxicológica A y B.'
        )
    else:
        status = CheckStatus.CLEAR
        summary = (
            f'{distance_text} de {nearest.name}, fuera de las franjas de '
            f'{_fmt_m(rule.terrestrial_m)} m (terrestre) y {_fmt_m(rule.aerial_m)} m (aérea).'
        )

    return CheckResult(
        key=KEY,
        title=TITLE,
        status=status,
        summary=summary,
        origin=CheckOrigin.OFFICIAL_LAYER,
        sources=[_norm_source(r) for r in used_rules.values()] + [osm_source],
        details=details,
    )
