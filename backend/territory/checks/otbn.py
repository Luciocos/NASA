"""Chequeo: Bosque nativo (OTBN, Ley 26.331).

Cruza el polígono del lote con el Ordenamiento Territorial de Bosques Nativos de Santa Fe
(capa oficial, ver data/layers/otbn/README.md) y lo combina con la bitácora satelital:

- Superposición con categoría I o II y cambio de uso del suelo (evento LAND_USE_CHANGE o
  declaración del productor): alerta fuerte de posible desmonte.
- Superposición con categoría I o II sin cambio de uso: posible conflicto, a revisar.
- Sin superposición con I o II: CLEAR.
- Sin capa, o lote fuera del área que cubre el recorte: NO_DATA.

Es un cruce indicativo. No es un dictamen legal ni una auditoría.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import shapely
from django.conf import settings
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

from events.models import EventType
from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus, LayerSource

KEY = 'otbn'
TITLE = 'Bosque nativo (OTBN, Ley 26.331)'

LAYER_PATH: Path = settings.BASE_DIR.parent / 'data' / 'layers' / 'otbn' / 'otbn_santa_fe.geojson'

CATEGORIES = ('I', 'II', 'III')
PROTECTED = ('I', 'II')  # no admiten desmonte (Ley 26.331, art. 9)
CATEGORY_LABELS = {'I': 'I (rojo)', 'II': 'II (amarillo)', 'III': 'III (verde)'}

SOURCE = LayerSource(
    name='OTBN - Provincia de Santa Fe (Ley provincial 13.372, Decreto 1.690/2022)',
    publisher='Ministerio de Ambiente de la Nación, IDE Ambiental (capa bosques:SF_2022_OTBN)',
    url='https://geo.ambiente.gob.ar/geoserver/wfs',
    date='2022-09-12',
    license='Creative Commons (según el geoservicio: "licencia libre")',
)

_TO_METRIC = Transformer.from_crs('EPSG:4326', 'EPSG:32720', always_xy=True)
_TO_WGS84 = Transformer.from_crs('EPSG:32720', 'EPSG:4326', always_xy=True)


def _project(geom: BaseGeometry, transformer: Transformer) -> BaseGeometry:
    return shapely.transform(geom, lambda x, y: transformer.transform(x, y), interleaved=False)


@dataclass(frozen=True)
class Layer:
    categories: list[str]
    geoms: list[BaseGeometry]  # en EPSG:32720
    tree: STRtree
    coverage: BaseGeometry | None  # área recortada (EPSG:4326); None si no se informa


@cache
def load_layer(path: Path) -> Layer | None:
    """Lee la capa una sola vez por proceso. None si no existe o no se puede leer."""
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    categories: list[str] = []
    geoms: list[BaseGeometry] = []
    for feature in data.get('features', []):
        category = (feature.get('properties') or {}).get('category')
        if category not in CATEGORIES or not feature.get('geometry'):
            continue
        geom = shapely.make_valid(_project(shape(feature['geometry']), _TO_METRIC))
        if geom.is_empty:
            continue
        categories.append(category)
        geoms.append(geom)
    if not geoms:
        return None
    coverage = None
    bbox = (data.get('properties') or {}).get('clip_bbox_lat_lon')
    if bbox and len(bbox) == 4:
        lat_min, lon_min, lat_max, lon_max = bbox
        coverage = box(lon_min, lat_min, lon_max, lat_max)
    return Layer(categories, geoms, STRtree(geoms), coverage)


def _land_use_change(lot: Lot) -> tuple[bool, list[dict[str, Any]]]:
    events = lot.events.filter(type=EventType.LAND_USE_CHANGE).order_by('date')
    listed = [
        {
            'id': e.pk,
            'date': e.date.isoformat(),
            'sensor': e.sensor,
            'origin': e.origin,
            'is_simulated': e.is_simulated,
        }
        for e in events
    ]
    return bool(listed), listed


def _num(value: float, decimals: int = 1) -> str:
    """Número con coma decimal (español de Argentina)."""
    return f'{value:.{decimals}f}'.replace('.', ',')


def _round_geojson(geom: BaseGeometry) -> dict[str, Any]:
    return mapping(shapely.set_precision(geom, 1e-6))


def run(lot: Lot) -> CheckResult:
    layer = load_layer(LAYER_PATH)
    if layer is None:
        return CheckResult(
            key=KEY,
            title=TITLE,
            status=CheckStatus.NO_DATA,
            summary=(
                'Falta la capa del Ordenamiento Territorial de Bosques Nativos de Santa Fe '
                '(data/layers/otbn/otbn_santa_fe.geojson). Se genera con '
                'pipeline/scripts/build_layer_otbn.py.'
            ),
            origin=CheckOrigin.OFFICIAL_LAYER,
            sources=[SOURCE],
        )

    lot_wgs = shapely.make_valid(shape(lot.geometry))
    if layer.coverage is not None and not layer.coverage.contains(lot_wgs):
        return CheckResult(
            key=KEY,
            title=TITLE,
            status=CheckStatus.NO_DATA,
            summary=(
                'El lote queda fuera del área que cubre la capa recortada (sur de Santa Fe). '
                'No se puede cruzar con el OTBN.'
            ),
            origin=CheckOrigin.OFFICIAL_LAYER,
            sources=[SOURCE],
            details={'coverage_bbox_lat_lon': list(layer.coverage.bounds)},
        )

    lot_m = _project(lot_wgs, _TO_METRIC)
    lot_area = lot_m.area
    overlap_geoms: dict[str, list[BaseGeometry]] = {c: [] for c in CATEGORIES}
    for idx in layer.tree.query(lot_m, predicate='intersects'):
        inter = layer.geoms[idx].intersection(lot_m)
        if not inter.is_empty and inter.area > 0:
            overlap_geoms[layer.categories[int(idx)]].append(inter)

    overlap: dict[str, dict[str, float]] = {}
    overlap_features: list[dict[str, Any]] = []
    for category in CATEGORIES:
        merged = shapely.union_all(overlap_geoms[category]) if overlap_geoms[category] else None
        area_m2 = merged.area if merged is not None else 0.0
        overlap[category] = {
            'ha': round(area_m2 / 10_000, 2),
            'pct': round(100 * area_m2 / lot_area, 1) if lot_area else 0.0,
        }
        if merged is not None and area_m2 > 0:
            overlap_features.append(
                {
                    'type': 'Feature',
                    'properties': {'category': category},
                    'geometry': _round_geojson(_project(merged, _TO_WGS84)),
                }
            )

    protected_idx = [i for i, c in enumerate(layer.categories) if c in PROTECTED]
    nearest_m: float | None = None
    nearest_category: str | None = None
    if protected_idx:
        dist, idx = min((layer.geoms[i].distance(lot_m), i) for i in protected_idx)
        nearest_m = round(dist)
        nearest_category = layer.categories[idx]

    change_detected, change_events = _land_use_change(lot)
    change_declared = None if lot.land_use_unchanged is None else not lot.land_use_unchanged

    details: dict[str, Any] = {
        'lot_area_ha': round(lot_area / 10_000, 2),
        'overlap': overlap,
        'nearest_protected_m': nearest_m,
        'nearest_protected_category': nearest_category,
        'land_use_change_detected': change_detected,
        'land_use_change_events': change_events,
        'land_use_change_declared': change_declared,
        'overlap_geojson': {'type': 'FeatureCollection', 'features': overlap_features},
        'strong_alert': False,
    }

    protected_ha = sum(overlap[c]['ha'] for c in PROTECTED)
    protected_pct = sum(overlap[c]['pct'] for c in PROTECTED)
    protected_cats = [CATEGORY_LABELS[c] for c in PROTECTED if overlap[c]['ha'] > 0]

    if protected_cats:
        zone = ' y '.join(protected_cats)
        base = (
            f'El lote se superpone con bosque nativo de categoría {zone} '
            f'({_num(protected_ha, 2)} ha, {_num(protected_pct)} % del lote).'
        )
        if change_detected or change_declared:
            details['strong_alert'] = True
            why = []
            if change_detected:
                why.append('la bitácora satelital registra un cambio de uso del suelo')
            if change_declared:
                why.append('el productor declaró un cambio de uso desde 2020')
            summary = (
                f'Alerta: posible desmonte. {base} Además {" y ".join(why)}. '
                'Estas categorías no admiten desmonte: revisar con la autoridad provincial.'
            )
        else:
            summary = (
                f'{base} El lote se superpone con zona protegida; no se detectó cambio de uso.'
            )
        status = CheckStatus.POSSIBLE_CONFLICT
    else:
        summary = 'Sin superposición detectada con bosque nativo de categoría I o II.'
        if nearest_m is not None:
            summary += f' El polígono protegido más cercano está a {_num(nearest_m / 1000)} km.'
        if overlap['III']['ha'] > 0:
            summary += ' Hay superposición con categoría III (verde).'
        status = CheckStatus.CLEAR

    return CheckResult(
        key=KEY,
        title=TITLE,
        status=status,
        summary=summary,
        origin=CheckOrigin.OFFICIAL_LAYER,
        sources=[SOURCE],
        details=details,
    )
