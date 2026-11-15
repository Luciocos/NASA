"""Arma la capa de áreas urbanas para el chequeo de distancias de exclusión periurbanas.

Fuente: OpenStreetMap vía Overpass API (© OpenStreetMap contributors, licencia ODbL).

Qué hace:
1. Descarga los polígonos landuse=residential y los nodos place=city/town/village de una
   caja alrededor de los lotes demo (BBOX).
2. Une los polígonos residenciales. Para soldar manzanas separadas por calles aplica un
   cierre morfológico (buffer de +MERGE_M y luego -MERGE_M, en UTM 20S).
3. Se queda con los componentes a menos de PLACE_MAX_DIST_M de un nodo place, y les pone
   el nombre de ese nodo. Los residenciales sueltos (casas de campo) se descartan.
4. Simplifica (SIMPLIFY_M) y guarda data/layers/periurban/urban_areas.geojson en EPSG:4326.

Limitación: la "planta urbana" de la Ley 11.273 la delimita cada municipio o comuna por
ordenanza (Decreto 552/97, art. 52). Esta capa es una aproximación con OSM, no el límite
oficial.

Los parámetros MERGE_M, PLACE_MAX_DIST_M y SIMPLIFY_M son de procesamiento geométrico
(no vienen de la norma) y quedan registrados en las propiedades de cada feature.

Uso: python scripts/build_layer_periurban.py
"""

import json
from datetime import date
from pathlib import Path

import numpy as np
import requests
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import polygonize, unary_union

REPO_DIR = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_DIR / 'data' / 'layers' / 'periurban'
RAW_DIR = REPO_DIR / 'pipeline' / 'output' / 'periurban_raw'  # ignorado por git

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
# (sur, oeste, norte, este): lotes demo al oeste de Casilda con más de 10 km de margen.
BBOX = (-33.25, -61.40, -32.90, -61.00)
MERGE_M = 50.0
PLACE_MAX_DIST_M = 1500.0
SIMPLIFY_M = 10.0

QUERY = f"""
[out:json][timeout:120];
(
  way["landuse"="residential"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  relation["landuse"="residential"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  node["place"~"^(city|town|village)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out geom;
"""

TO_UTM = Transformer.from_crs('EPSG:4326', 'EPSG:32720', always_xy=True).transform
TO_WGS = Transformer.from_crs('EPSG:32720', 'EPSG:4326', always_xy=True).transform


def transform(func, geom):
    """Reproyecta una geometría con un Transformer de pyproj (x, y)."""
    return shapely.transform(geom, lambda c: np.column_stack(func(c[:, 0], c[:, 1])))


def fetch() -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw = RAW_DIR / 'overpass.json'
    if raw.exists():
        return json.loads(raw.read_text())
    response = requests.post(
        OVERPASS_URL,
        data={'data': QUERY},
        headers={'User-Agent': 'lotestigo-pipeline/0.1'},
        timeout=180,
    )
    response.raise_for_status()
    raw.write_text(response.text)
    return response.json()


def ring(points: list[dict]) -> list[tuple[float, float]]:
    return [(p['lon'], p['lat']) for p in points]


def element_polygons(element: dict) -> list[Polygon]:
    if element['type'] == 'way':
        coords = ring(element.get('geometry', []))
        if len(coords) >= 4 and coords[0] == coords[-1]:
            return [Polygon(coords)]
        return []
    if element['type'] == 'relation':
        outers = [
            LineString(ring(m['geometry']))
            for m in element.get('members', [])
            if m.get('role') == 'outer' and m.get('geometry')
        ]

        return list(polygonize(unary_union(outers))) if outers else []
    return []


def main() -> None:
    data = fetch()
    polygons: list[Polygon] = []
    places: list[tuple[str, str, Point]] = []
    for element in data['elements']:
        if element['type'] == 'node':
            tags = element.get('tags', {})
            places.append(
                (
                    tags.get('name', ''),
                    tags.get('place', ''),
                    transform(TO_UTM, Point(element['lon'], element['lat'])),
                )
            )
        else:
            polygons.extend(transform(TO_UTM, p.buffer(0)) for p in element_polygons(element))

    merged = unary_union(polygons).buffer(MERGE_M).buffer(-MERGE_M)
    parts = list(getattr(merged, 'geoms', [merged]))

    by_place: dict[str, list] = {}
    kinds: dict[str, str] = {}
    for part in parts:
        if part.is_empty:
            continue
        nearest = min(places, key=lambda p: part.distance(p[2]), default=None)
        if nearest is None or part.distance(nearest[2]) > PLACE_MAX_DIST_M:
            continue
        by_place.setdefault(nearest[0], []).append(part)
        kinds[nearest[0]] = nearest[1]

    today = date.today().isoformat()
    features = []
    for name, geoms in sorted(by_place.items()):
        geom = unary_union(geoms).simplify(SIMPLIFY_M)
        features.append(
            {
                'type': 'Feature',
                'properties': {
                    'name': name,
                    'place': kinds[name],
                    'area_ha': round(geom.area / 10_000, 1),
                    'source': 'OpenStreetMap landuse=residential (Overpass API)',
                    'attribution': '© OpenStreetMap contributors',
                    'license': 'ODbL 1.0',
                    'downloaded': today,
                    'method': (
                        f'unión + cierre {MERGE_M:.0f} m, place a <= {PLACE_MAX_DIST_M:.0f} m, '
                        f'simplificado {SIMPLIFY_M:.0f} m'
                    ),
                },
                'geometry': mapping(shapely.set_precision(transform(TO_WGS, geom), 1e-6)),
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / 'urban_areas.geojson'
    out.write_text(
        json.dumps(
            {
                'type': 'FeatureCollection',
                'name': 'urban_areas',
                'attribution': '© OpenStreetMap contributors (ODbL)',
                'features': features,
            },
            ensure_ascii=False,
        )
    )
    print(f'{len(features)} localidades -> {out} ({out.stat().st_size / 1024:.0f} KB)')
    for f in features:
        print(
            f'  {f["properties"]["name"]} ({f["properties"]["place"]}): '
            f'{f["properties"]["area_ha"]} ha'
        )


if __name__ == '__main__':
    main()
