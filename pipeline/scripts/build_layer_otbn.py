"""Descarga la capa OTBN de Santa Fe y guarda un recorte liviano para el chequeo 'otbn'.

Fuente: IDE Ambiental, Ministerio de Ambiente de la Nación (geoservicio WFS), capa
bosques:SF_2022_OTBN: Ordenamiento Territorial de Bosques Nativos de Santa Fe (Ley 26.331,
Ley provincial 13.372, actualizado por Decreto 1.690/2022).

Salida: data/layers/otbn/otbn_santa_fe.geojson (EPSG:4326), con atributo `category`
normalizado a I/II/III. Ver data/layers/otbn/README.md.

Recorte: rectángulo del sur de Santa Fe alrededor de los lotes demo (CLIP_BBOX). Los
polígonos se simplifican con una tolerancia chica (SIMPLIFY_DEG) para mantener el archivo
por debajo de 2 MB. No se agregan ni se inventan polígonos.

Uso: python scripts/build_layer_otbn.py
"""

import json
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent
OUT_DIR = REPO_DIR / 'data' / 'layers' / 'otbn'
OUT_FILE = OUT_DIR / 'otbn_santa_fe.geojson'

WFS_URL = 'https://geo.ambiente.gob.ar/geoserver/wfs'
TYPE_NAME = 'bosques:SF_2022_OTBN'
# lat_min, lon_min, lat_max, lon_max (orden de ejes de EPSG:4326 en WFS 2.0).
CLIP_BBOX = (-33.8, -62.3, -32.3, -60.3)
SIMPLIFY_DEG = 0.00005  # unos 5 m
COORD_DECIMALS = 6
MAX_BYTES = 2 * 1024 * 1024

CATEGORY_MAP = {'I': 'I', 'II': 'II', 'III': 'III', '1': 'I', '2': 'II', '3': 'III'}


def fetch() -> dict:
    lat_min, lon_min, lat_max, lon_max = CLIP_BBOX
    params = {
        'service': 'WFS',
        'version': '2.0.0',
        'request': 'GetFeature',
        'typeNames': TYPE_NAME,
        'outputFormat': 'application/json',
        'srsName': 'urn:ogc:def:crs:EPSG::4326',
        'bbox': f'{lat_min},{lon_min},{lat_max},{lon_max},urn:ogc:def:crs:EPSG::4326',
    }
    url = f'{WFS_URL}?{urllib.parse.urlencode(params)}'
    print(f'Descargando {url}')
    with urllib.request.urlopen(url, timeout=300) as response:
        return json.load(response)


def round_coords(value):
    if isinstance(value, float):
        return round(value, COORD_DECIMALS)
    if isinstance(value, (list, tuple)):
        return [round_coords(v) for v in value]
    return value


def polygonal(geom):
    """make_valid puede devolver una colección: se conservan solo las partes de área."""
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = [g for g in getattr(geom, 'geoms', []) if isinstance(g, (Polygon, MultiPolygon))]
    return unary_union(parts) if parts else Polygon()


def normalize(collection: dict) -> dict:
    features = []
    skipped = 0
    for feature in collection.get('features', []):
        props = feature.get('properties') or {}
        category = CATEGORY_MAP.get(str(props.get('cat_cons', '')).strip().upper())
        if category is None or not feature.get('geometry'):
            skipped += 1
            continue
        geom = polygonal(make_valid(shape(feature['geometry'])))
        geom = geom.simplify(SIMPLIFY_DEG, preserve_topology=True)
        if geom.is_empty:
            skipped += 1
            continue
        geometry = mapping(geom)
        features.append(
            {
                'type': 'Feature',
                'properties': {
                    'category': category,
                    'source_id': props.get('id'),
                    'clase': props.get('clase'),
                    'source_area_ha': props.get('area_ha'),
                },
                'geometry': {
                    'type': geometry['type'],
                    'coordinates': round_coords(geometry['coordinates']),
                },
            }
        )
    print(f'{len(features)} polígonos, {skipped} descartados sin categoría o geometría')
    return {
        'type': 'FeatureCollection',
        'name': 'otbn_santa_fe',
        'properties': {
            'source': f'{WFS_URL} ({TYPE_NAME})',
            'downloaded': date.today().isoformat(),
            'clip_bbox_lat_lon': list(CLIP_BBOX),
            'simplify_deg': SIMPLIFY_DEG,
        },
        'features': features,
    }


def swap_axes_if_needed(collection: dict) -> dict:
    """GeoServer con srsName URN entrega lat/lon. Se detecta y se invierte a lon/lat."""

    def first_xy(coords):
        while isinstance(coords[0], list):
            coords = coords[0]
        return coords

    feats = collection.get('features', [])
    if not feats:
        return collection
    x, _ = first_xy(feats[0]['geometry']['coordinates'])
    if x < -40:  # ya está en lon/lat (Santa Fe: lat -28..-34, lon -58..-63)
        return collection

    def swap(coords):
        if isinstance(coords[0], (int, float)):
            return [coords[1], coords[0], *coords[2:]]
        return [swap(c) for c in coords]

    for feature in feats:
        feature['geometry']['coordinates'] = swap(feature['geometry']['coordinates'])
    return collection


def main() -> None:
    raw = fetch()
    collection = normalize(swap_axes_if_needed(raw))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(collection, ensure_ascii=False, separators=(',', ':'))
    OUT_FILE.write_text(text, encoding='utf-8')
    size = OUT_FILE.stat().st_size
    print(f'Guardado {OUT_FILE} ({size / 1024:.0f} KB)')
    if size > MAX_BYTES:
        print('Atención: supera 2 MB. Subir SIMPLIFY_DEG o achicar CLIP_BBOX.')


if __name__ == '__main__':
    main()
