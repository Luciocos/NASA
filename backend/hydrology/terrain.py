"""Cuenca, subcuencas y recorrido del agua sobre las grillas que generó el pipeline.

El relleno de depresiones, la dirección de flujo D8 y la acumulación se calculan offline
(pipeline/scripts/hydrology_terrain.py). Acá solo se recorre esa red: desde un punto de salida
hacia aguas arriba, lo que es barato y permite mover el punto de salida desde el mapa.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import shapely
from django.conf import settings
from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
NO_FLOW = 255
M_PER_DEG = 111_320.0
GEOD = Geod(ellps='WGS84')
# un clic en el mapa se lleva a la celda de mayor acumulación a esta distancia (en celdas),
# para que el punto de salida caiga sobre la línea de flujo y no al costado
SNAP_CELLS = 3
TOP_POINTS = 6


def data_dir() -> Path:
    return Path(settings.MEDIA_ROOT) / 'hydrology' / 'lote3'


@dataclass
class Network:
    """una red D8: para cada celda, adónde va el agua y quiénes le aportan"""

    down: np.ndarray  # índice plano de la celda de aguas abajo, -1 si sale de la ventana
    step_m: np.ndarray  # largo del paso hacia aguas abajo
    sources: np.ndarray  # celdas ordenadas por su celda de destino
    starts: np.ndarray  # dónde empiezan en `sources` las que aportan a cada celda

    def upstream(self, seeds: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """celdas aguas arriba de las semillas (incluidas), su celda padre y su distancia al
        punto de salida a lo largo del flujo. En orden de aguas abajo a aguas arriba"""
        seeds = np.unique(seeds.astype(np.int64))
        cells = [seeds]
        parents = [np.full(seeds.shape, -1, dtype=np.int64)]
        dists = [np.zeros(seeds.shape)]
        seen = np.zeros(self.down.shape, dtype=bool)
        seen[seeds] = True
        frontier, dist = seeds, np.zeros(seeds.shape)
        while frontier.size:
            s, e = self.starts[frontier], self.starts[frontier + 1]
            counts = e - s
            total = int(counts.sum())
            if total == 0:
                break
            offsets = np.repeat(s - np.cumsum(counts) + counts, counts) + np.arange(total)
            children = self.sources[offsets]
            parent = np.repeat(frontier, counts)
            child_dist = np.repeat(dist, counts) + self.step_m[children]
            keep = ~seen[children]
            children, parent, child_dist = children[keep], parent[keep], child_dist[keep]
            seen[children] = True
            cells.append(children)
            parents.append(parent)
            dists.append(child_dist)
            frontier, dist = children, child_dist
        return np.concatenate(cells), np.concatenate(parents), np.concatenate(dists)


@dataclass
class Terrain:
    rows: int
    cols: int
    transform: tuple[float, ...]
    dem: np.ndarray
    acc: np.ndarray
    tan_slope: np.ndarray
    twi: np.ndarray
    fill_depth: np.ndarray
    cell_area: np.ndarray  # m2, plano
    igbp: np.ndarray | None
    network: Network
    network_dem: Network
    meta: dict

    def index(self, lat: float, lng: float) -> int | None:
        a, _, c, _, e, f = self.transform
        col = int((lng - c) // a)
        row = int((lat - f) // e)
        if 0 <= row < self.rows and 0 <= col < self.cols:
            return row * self.cols + col
        return None

    def center(self, idx: int) -> tuple[float, float]:
        a, _, c, _, e, f = self.transform
        row, col = divmod(int(idx), self.cols)
        return f + e * (row + 0.5), c + a * (col + 0.5)

    def cell_mask(self, geometry: dict) -> np.ndarray:
        """índices de las celdas cuyo centro cae en el polígono"""
        poly = shape(geometry)
        a, _, c, _, e, f = self.transform
        west, south, east, north = poly.bounds
        c0 = max(0, int((west - c) // a))
        c1 = min(self.cols - 1, int((east - c) // a))
        r0 = max(0, int((north - f) // e))
        r1 = min(self.rows - 1, int((south - f) // e))
        if c0 > c1 or r0 > r1:
            return np.array([], dtype=np.int64)
        rr, cc = np.mgrid[r0 : r1 + 1, c0 : c1 + 1]
        lng = c + a * (cc + 0.5)
        lat = f + e * (rr + 0.5)
        inside = shapely.contains_xy(poly, lng, lat)
        return (rr[inside] * self.cols + cc[inside]).ravel().astype(np.int64)

    def snap(self, lat: float, lng: float) -> int | None:
        idx = self.index(lat, lng)
        if idx is None:
            return None
        row, col = divmod(idx, self.cols)
        r0, r1 = max(0, row - SNAP_CELLS), min(self.rows, row + SNAP_CELLS + 1)
        c0, c1 = max(0, col - SNAP_CELLS), min(self.cols, col + SNAP_CELLS + 1)
        window = self.acc.reshape(self.rows, self.cols)[r0:r1, c0:c1]
        rr, cc = np.unravel_index(int(np.argmax(window)), window.shape)
        return (r0 + rr) * self.cols + (c0 + cc)

    def touches_edge(self, cells: np.ndarray) -> bool:
        row, col = np.divmod(cells, self.cols)
        return bool(
            (row == 0).any()
            or (col == 0).any()
            or (row == self.rows - 1).any()
            or (col == self.cols - 1).any()
        )

    def polygon(self, cells: np.ndarray):
        """polígono de un conjunto de celdas, uniendo tiras horizontales"""
        if cells.size == 0:
            return None
        cells = np.sort(cells)
        row, col = np.divmod(cells, self.cols)
        brk = np.nonzero((np.diff(cells) != 1) | (np.diff(row) != 0))[0]
        first = np.concatenate([[0], brk + 1])
        last = np.concatenate([brk, [cells.size - 1]])
        a, _, c, _, e, f = self.transform
        boxes = shapely.box(
            c + a * col[first],
            f + e * (row[first] + 1),
            c + a * (col[last] + 1),
            f + e * row[first],
        )
        return unary_union(boxes).simplify(abs(a) * 0.3, preserve_topology=True)


def _network(code: np.ndarray, dx: np.ndarray, dy: float) -> Network:
    rows, cols = code.shape
    down = np.full(rows * cols, -1, dtype=np.int64)
    step = np.zeros(rows * cols)
    rr, cc = np.mgrid[0:rows, 0:cols]
    for k, (dr, dc) in enumerate(OFFSETS):
        sel = code == k
        down[sel.ravel()] = ((rr + dr) * cols + (cc + dc))[sel]
        length = np.sqrt((dc * dx[:, None]) ** 2 + (dr * dy) ** 2) * np.ones((1, cols))
        step[sel.ravel()] = length[sel]
    src = np.nonzero(down >= 0)[0]
    order = np.argsort(down[src], kind='stable')
    sources = src[order]
    starts = np.searchsorted(down[sources], np.arange(rows * cols + 1))
    return Network(down=down, step_m=step, sources=sources, starts=starts)


@lru_cache(maxsize=1)
def load() -> Terrain | None:
    folder = data_dir()
    if not (folder / 'terrain.npz').exists():
        return None
    data = np.load(folder / 'terrain.npz')
    t = tuple(float(v) for v in data['transform'])
    code = data['code']
    rows, cols = code.shape
    lat = t[5] + t[4] * (np.arange(rows) + 0.5)
    dx = abs(t[0]) * M_PER_DEG * np.cos(np.radians(lat))
    dy = abs(t[4]) * M_PER_DEG
    igbp = None
    if (folder / 'landcover.npz').exists():
        igbp = np.load(folder / 'landcover.npz')['igbp'].ravel()
    return Terrain(
        rows=rows,
        cols=cols,
        transform=t,
        dem=data['dem'].ravel().astype(np.float64),
        acc=data['acc'].ravel().astype(np.float64),
        tan_slope=data['tan_slope'].ravel().astype(np.float64),
        twi=data['twi'].ravel().astype(np.float64),
        fill_depth=data['fill_depth'].ravel().astype(np.float64),
        cell_area=np.repeat(dx * dy, cols),
        igbp=igbp,
        network=_network(code, dx, dy),
        network_dem=_network(data['code_dem'], dx, dy),
        meta=json.loads((folder / 'terrain.json').read_text()),
    )


@lru_cache(maxsize=1)
def osm_waterways() -> list:
    raw = json.loads((data_dir() / 'osm_waterways.geojson').read_text())
    return [(shape(f['geometry']), f['properties']) for f in raw['features']]


def length_m(geom) -> float:
    return float(GEOD.geometry_length(geom)) if geom is not None and not geom.is_empty else 0.0


def clip_lines(items: list, area, keep: tuple[str, ...]) -> list[dict]:
    out = []
    for geom, props in items:
        if not geom.intersects(area):
            continue
        part = geom.intersection(area)
        if part.is_empty:
            continue
        out.append(
            {
                'type': 'Feature',
                'geometry': mapping(part),
                'properties': {
                    **{k: props.get(k) for k in keep},
                    'length_m': round(length_m(part)),
                },
            }
        )
    return out


def basin_streams(terrain: Terrain, cells: np.ndarray, threshold_m2: float) -> list[dict]:
    """cauces potenciales de la cuenca: celdas con al menos threshold_m2 aguas arriba"""
    from shapely.geometry import LineString
    from shapely.ops import linemerge

    stream = cells[terrain.acc[cells] >= threshold_m2]
    down = terrain.network.down
    segments = []
    for c in stream.tolist():
        d = int(down[c])
        if d < 0:
            continue
        a = terrain.center(c)
        b = terrain.center(d)
        segments.append(LineString([(a[1], a[0]), (b[1], b[0])]))
    if not segments:
        return []
    merged = linemerge(segments)
    lines = list(getattr(merged, 'geoms', [merged]))
    out = []
    for line in lines:
        lng, lat = line.coords[-1]
        idx = terrain.index(lat, lng)
        out.append(
            {
                'type': 'Feature',
                'geometry': mapping(line),
                'properties': {
                    'upstream_ha': round(float(terrain.acc[idx]) / 1e4, 1) if idx else None,
                    'length_m': round(length_m(line)),
                },
            }
        )
    return out


def subbasins(terrain: Terrain, cells, parents, threshold_m2: float) -> list[dict]:
    """divide la cuenca en las áreas que drenan a cada tramo de cauce entre confluencias"""
    acc = terrain.acc
    stream = acc[cells] >= threshold_m2
    is_stream = np.zeros(acc.shape, dtype=bool)
    is_stream[cells[stream]] = True
    # confluencia: celda de cauce con dos o más celdas de cauce aguas arriba
    stream_children = np.zeros(acc.shape, dtype=np.int64)
    sc = cells[stream & (parents >= 0)]
    np.add.at(stream_children, terrain.network.down[sc], 1)
    junction = stream_children >= 2
    label = np.full(acc.shape, -1, dtype=np.int64)
    label[cells[parents < 0]] = 0
    next_id = 1
    # las celdas vienen en orden de aguas abajo a aguas arriba: el padre ya tiene etiqueta
    starts_new = is_stream[cells] & (parents >= 0) & junction[np.maximum(parents, 0)]
    new_ids = np.cumsum(starts_new) + next_id - 1
    for i in range(cells.size):
        p = parents[i]
        if p < 0:
            continue
        label[cells[i]] = new_ids[i] if starts_new[i] else label[p]
    labels = label[cells]
    out = []
    for lab in np.unique(labels):
        members = cells[labels == lab]
        poly = terrain.polygon(members)
        out.append(
            {
                'id': int(lab),
                'area_ha': round(float(terrain.cell_area[members].sum()) / 1e4, 1),
                'geometry': mapping(poly),
            }
        )
    out.sort(key=lambda s: -s['area_ha'])
    for n, s in enumerate(out, 1):
        s['id'] = n
    return out
