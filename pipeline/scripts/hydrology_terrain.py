"""Terreno de la cuenca del lote de prueba (Lote 3, Casilda) para la pestaña Cuenca y Caudal.

Pasos (todo offline, nada de esto corre en el backend):
1. Recorta el Copernicus DEM GLO-30 (DSM de 1 segundo de arco, AWS Open Data, sin login) a una
   ventana alrededor del lote.
2. Baja de OpenStreetMap los cursos de agua mapeados (canales, zanjas, desagües, arroyos) y los
   "quema" en el DEM para que el flujo los siga.
3. Rellena depresiones con Priority-Flood+epsilon (Barnes, Lehman y Mulla 2014) y calcula la
   dirección de flujo D8 por máxima pendiente.
4. Calcula la acumulación de flujo (área aguas arriba de cada celda) y el índice topográfico de
   humedad TWI = ln(a / tan b) (Beven y Kirkby 1979).
5. Repite D8 sin quemar OSM, para medir cuánto depende la cuenca de esa decisión.

Salida en data/hydrology/lote3/: terrain.npz (grillas que usa el backend para delimitar la cuenca
desde cualquier punto de salida), osm_waterways.geojson, PNG de capas y
terrain.json con los metadatos. Ver data/hydrology/README.md.

Uso: python scripts/hydrology_terrain.py
"""

import heapq
import json
import time
from collections import deque
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.features import rasterize
from rasterio.merge import merge
from shapely.geometry import shape

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent
OUT_DIR = REPO_DIR / 'data' / 'hydrology' / 'lote3'
RAW_DIR = PIPELINE_DIR / 'output' / 'hydrology_raw'

LOT_FILE = REPO_DIR / 'data' / 'demo' / 'lote3.json'
# ventana de análisis: media ventana en grados alrededor del centro del lote. La cuenca que
# toque el borde se informa como incompleta
HALF_LAT = 0.09
HALF_LON = 0.10

DEM_URL = (
    'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{tile}_DEM/'
    'Copernicus_DSM_COG_10_{tile}_DEM.tif'
)
OVERPASS = 'https://overpass-api.de/api/interpreter'
OSM_WATERWAYS = ('canal', 'ditch', 'drain', 'stream', 'river')

# criterios de modelado (no son mediciones; se documentan en terrain.json y en el README)
BURN_M = 3.0  # cuánto se baja el DEM sobre un curso OSM para que el flujo lo siga
EPSILON_M = 1e-4  # pendiente mínima que impone el relleno sobre zonas planas
MIN_TAN_SLOPE = 0.001  # piso de tan(b) en el TWI, para que las zonas planas no den infinito

# vecinos D8 (fila, columna). El código 255 significa que el agua sale de la ventana
OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
NO_FLOW = 255
M_PER_DEG = 111_320.0


def tile_name(lat: float, lon: float) -> str:
    lat0 = int(np.floor(lat))
    lon0 = int(np.floor(lon))
    ns = f'{"N" if lat0 >= 0 else "S"}{abs(lat0):02d}_00'
    ew = f'{"E" if lon0 >= 0 else "W"}{abs(lon0):03d}_00'
    return f'{ns}_{ew}'


def lot_geometry() -> dict:
    return json.loads(LOT_FILE.read_text())['lot']['geometry']


def read_dem(bounds: tuple[float, float, float, float]) -> tuple[np.ndarray, rasterio.Affine]:
    west, south, east, north = bounds
    tiles = sorted(
        {tile_name(lat, lon) for lat in (south, north - 1e-9) for lon in (west, east - 1e-9)}
    )
    sources = [rasterio.open(DEM_URL.format(tile=t)) for t in tiles]
    try:
        dem, transform = merge(sources, bounds=bounds, nodata=-9999)
    finally:
        for s in sources:
            s.close()
    return dem[0].astype(np.float64), transform


def fetch_osm(bounds: tuple[float, float, float, float]) -> dict:
    cache = RAW_DIR / 'osm_waterways.json'
    if not cache.exists():
        west, south, east, north = bounds
        kinds = '|'.join(OSM_WATERWAYS)
        query = (
            f'[out:json][timeout:90];way["waterway"~"^({kinds})$"]'
            f'({south},{west},{north},{east});out geom tags;'
        )
        for attempt in range(5):
            r = requests.post(
                OVERPASS,
                data={'data': query},
                headers={'User-Agent': 'lotestigo-pipeline/0.1'},
                timeout=120,
            )
            if r.status_code not in (429, 502, 503, 504):
                break
            time.sleep(10 * (attempt + 1))
        r.raise_for_status()
        cache.write_text(r.text)
    raw = json.loads(cache.read_text())
    features = []
    for el in raw.get('elements', []):
        coords = [(p['lon'], p['lat']) for p in el.get('geometry', [])]
        if len(coords) < 2:
            continue
        tags = el.get('tags', {})
        features.append(
            {
                'type': 'Feature',
                'geometry': {'type': 'LineString', 'coordinates': coords},
                'properties': {
                    'osm_id': el['id'],
                    'waterway': tags.get('waterway'),
                    'name': tags.get('name'),
                    'culvert': tags.get('tunnel') == 'culvert',
                },
            }
        )
    return {'type': 'FeatureCollection', 'features': features}


def priority_flood_epsilon(z: np.ndarray) -> np.ndarray:
    """Rellena depresiones dejando una pendiente mínima EPSILON_M hacia el borde (Barnes 2014)."""
    rows, cols = z.shape
    filled = z.copy()
    closed = np.zeros(z.shape, dtype=bool)
    heap: list[tuple[float, int, int]] = []
    pit: deque[tuple[int, int]] = deque()
    for r in range(rows):
        for c in (0, cols - 1):
            if not closed[r, c]:
                closed[r, c] = True
                heapq.heappush(heap, (filled[r, c], r, c))
    for c in range(cols):
        for r in (0, rows - 1):
            if not closed[r, c]:
                closed[r, c] = True
                heapq.heappush(heap, (filled[r, c], r, c))
    while heap or pit:
        if pit:
            r, c = pit.popleft()
        else:
            _, r, c = heapq.heappop(heap)
        base = filled[r, c]
        for dr, dc in OFFSETS:
            nr, nc = r + dr, c + dc
            if nr < 0 or nc < 0 or nr >= rows or nc >= cols or closed[nr, nc]:
                continue
            closed[nr, nc] = True
            if filled[nr, nc] <= base + EPSILON_M:
                filled[nr, nc] = base + EPSILON_M
                pit.append((nr, nc))
            else:
                heapq.heappush(heap, (filled[nr, nc], nr, nc))
    return filled


def cell_sizes(transform: rasterio.Affine, rows: int) -> tuple[np.ndarray, float]:
    """ancho (m, por fila) y alto (m) de las celdas de la grilla geográfica"""
    lat = transform.f + transform.e * (np.arange(rows) + 0.5)
    dx = abs(transform.a) * M_PER_DEG * np.cos(np.radians(lat))
    dy = abs(transform.e) * M_PER_DEG
    return dx, dy


def d8(filled: np.ndarray, dx: np.ndarray, dy: float) -> np.ndarray:
    rows, cols = filled.shape
    best = np.zeros(filled.shape)
    code = np.full(filled.shape, NO_FLOW, dtype=np.uint8)
    pad = np.pad(filled, 1, constant_values=np.inf)
    dxc = dx[:, None]
    for k, (dr, dc) in enumerate(OFFSETS):
        neighbour = pad[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols]
        dist = np.sqrt((dc * dxc) ** 2 + (dr * dy) ** 2)
        slope = (filled - neighbour) / dist
        better = slope > best
        best = np.where(better, slope, best)
        code = np.where(better, k, code).astype(np.uint8)
    return code


def accumulate(code: np.ndarray, filled: np.ndarray, area: np.ndarray) -> np.ndarray:
    rows, cols = code.shape
    acc = area.astype(np.float64).ravel().copy()
    flat_code = code.ravel()
    order = np.argsort(-filled.ravel(), kind='stable')
    for idx in order:
        k = flat_code[idx]
        if k == NO_FLOW:
            continue
        dr, dc = OFFSETS[k]
        r, c = divmod(int(idx), cols)
        acc[(r + dr) * cols + (c + dc)] += acc[idx]
    return acc.reshape(rows, cols)


def png(path: Path, rgba: np.ndarray) -> None:
    Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(path, optimize=True)


def ramp(values: np.ndarray, colors: list[tuple[int, int, int]]) -> np.ndarray:
    """colores interpolados para valores de 0 a 1"""
    v = np.clip(values, 0, 1) * (len(colors) - 1)
    i = np.minimum(v.astype(int), len(colors) - 2)
    t = (v - i)[..., None]
    c = np.array(colors, dtype=float)
    return c[i] * (1 - t) + c[i + 1] * t


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    lot = shape(lot_geometry())
    cx, cy = lot.centroid.x, lot.centroid.y
    bounds = (cx - HALF_LON, cy - HALF_LAT, cx + HALF_LON, cy + HALF_LAT)

    dem_cache = RAW_DIR / 'dem.npz'
    if dem_cache.exists():
        saved = np.load(dem_cache)
        dem = saved['dem']
        transform = rasterio.Affine(*saved['transform'])
    else:
        dem, transform = read_dem(bounds)
        np.savez_compressed(dem_cache, dem=dem, transform=np.array(transform)[:6])
    if (dem <= -9000).any():
        raise SystemExit('El DEM tiene celdas sin dato en la ventana')
    rows, cols = dem.shape
    print(f'DEM {rows}x{cols}, {dem.min():.1f} a {dem.max():.1f} m')

    osm = fetch_osm(bounds)
    (OUT_DIR / 'osm_waterways.geojson').write_text(json.dumps(osm, ensure_ascii=False))
    lines = [shape(f['geometry']) for f in osm['features']]
    burn_mask = (
        rasterize(lines, out_shape=dem.shape, transform=transform, all_touched=True).astype(bool)
        if lines
        else np.zeros(dem.shape, dtype=bool)
    )
    print(f'OSM: {len(lines)} cursos, {burn_mask.sum()} celdas quemadas')

    dx, dy = cell_sizes(transform, rows)
    area = np.repeat((dx * dy)[:, None], cols, axis=1)

    print('relleno y D8 con OSM…')
    filled = priority_flood_epsilon(dem - BURN_M * burn_mask)
    code = d8(filled, dx, dy)
    acc = accumulate(code, filled, area)

    print('relleno y D8 solo con DEM…')
    filled_dem = priority_flood_epsilon(dem)
    code_dem = d8(filled_dem, dx, dy)
    # profundidad de relleno sobre el DEM original: dónde el relieve forma bajos cerrados
    fill_depth = filled_dem - dem

    # pendiente sobre el DEM suavizado 3x3 (el DSM tiene ruido del orden de las diferencias de
    # altura de un terreno tan plano)
    pad = np.pad(dem, 1, mode='edge')
    smooth = (
        sum(
            pad[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols]
            for dr in (-1, 0, 1)
            for dc in (-1, 0, 1)
        )
        / 9
    )
    gy, gx = np.gradient(smooth, dy, axis=0), np.gradient(smooth, axis=1) / dx[:, None]
    tan_slope = np.hypot(gx, gy)
    width = np.sqrt(area)
    twi = np.log((acc / width) / np.maximum(tan_slope, MIN_TAN_SLOPE))

    np.savez_compressed(
        OUT_DIR / 'terrain.npz',
        dem=dem.astype(np.float32),
        code=code,
        code_dem=code_dem,
        acc=acc.astype(np.float32),
        tan_slope=tan_slope.astype(np.float16),
        twi=twi.astype(np.float16),
        fill_depth=fill_depth.astype(np.float16),
        burned=burn_mask,
        transform=np.array(transform)[:6],
    )

    # capas para el mapa (solo visuales; los números salen de terrain.npz)
    log_acc = np.log10(acc / 1e4)  # ha
    acc_rgba = np.zeros((rows, cols, 4))
    acc_rgba[..., :3] = ramp(
        (log_acc - 0.5) / 2.5, [(150, 200, 230), (30, 110, 200), (10, 40, 140)]
    )
    acc_rgba[..., 3] = np.where(log_acc >= 0.5, 210, 0)
    png(OUT_DIR / 'flow_accumulation.png', acc_rgba)

    lo, hi = np.percentile(twi, [50, 99])
    twi_rgba = np.zeros((rows, cols, 4))
    t = (twi - lo) / (hi - lo)
    twi_rgba[..., :3] = ramp(t, [(250, 230, 160), (90, 170, 200), (20, 60, 150)])
    twi_rgba[..., 3] = np.where(t > 0, 60 + 160 * np.clip(t, 0, 1), 0)
    png(OUT_DIR / 'twi.png', twi_rgba)

    dep_rgba = np.zeros((rows, cols, 4))
    d = np.clip(fill_depth / 1.0, 0, 1)
    dep_rgba[..., :3] = ramp(d, [(120, 190, 255), (30, 80, 200)])
    dep_rgba[..., 3] = np.where(fill_depth > 0.05, 80 + 150 * d, 0)
    png(OUT_DIR / 'depressions.png', dep_rgba)

    west, north = transform.c, transform.f
    east = west + transform.a * cols
    south = north + transform.e * rows
    meta = {
        'lot': 'Lote 3',
        'generated_at': datetime.now(UTC).isoformat(timespec='seconds'),
        'grid': {
            'rows': rows,
            'cols': cols,
            'bounds': [west, south, east, north],
            'cell_deg': [transform.a, -transform.e],
            'crs': 'EPSG:4326',
        },
        'sources': {
            'dem': {
                'name': 'Copernicus DEM GLO-30 (DSM)',
                'provider': 'ESA / Copernicus, distribuido por AWS Open Data',
                'url': DEM_URL.format(tile='<tile>'),
                'note': 'Modelo digital de superficie: incluye árboles, edificios y terraplenes.',
            },
            'osm': {
                'name': 'OpenStreetMap, cursos de agua mapeados',
                'kinds': list(OSM_WATERWAYS),
                'count': len(osm['features']),
                'downloaded': datetime.now(UTC).date().isoformat(),
                'license': 'ODbL',
            },
        },
        'parameters': {
            'burn_m': BURN_M,
            'epsilon_m': EPSILON_M,
            'min_tan_slope': MIN_TAN_SLOPE,
            'note': (
                'Criterios de modelado, no mediciones. burn_m solo fuerza que el flujo siga los '
                'cursos de OSM.'
            ),
        },
        'methods': {
            'fill': 'Priority-Flood+epsilon (Barnes, Lehman y Mulla 2014)',
            'flow_direction': "D8 por máxima pendiente (O'Callaghan y Mark 1984)",
            'twi': 'ln(a / tan b) (Beven y Kirkby 1979), pendiente sobre DEM suavizado 3x3',
        },
        'layers': {
            'flow_accumulation': 'flow_accumulation.png',
            'twi': 'twi.png',
            'depressions': 'depressions.png',
        },
        'stats': {
            'dem_min_m': round(float(dem.min()), 2),
            'dem_max_m': round(float(dem.max()), 2),
            'burned_cells': int(burn_mask.sum()),
        },
    }
    (OUT_DIR / 'terrain.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print('listo:', OUT_DIR)


if __name__ == '__main__':
    main()
