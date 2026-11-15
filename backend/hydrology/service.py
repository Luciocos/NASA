"""Análisis de Cuenca y Caudal de un lote: cuenca aportante, historial y simulador.

Todo lo que devuelve lleva valor, unidad, fuente, método y limitación. Ver data/hydrology/README.md.
"""

import json
from collections import Counter
from datetime import date, datetime, timedelta
from functools import lru_cache

import numpy as np
from shapely.geometry import box, mapping, shape

from hydrology import terrain as terrain_mod
from hydrology.runoff import ARC_LEVELS, CoverShare, basin_excess, parameters, weighted_cn
from hydrology.unit_hydrograph import lag_hours, resample, route, step_for
from lots.models import Lot

HSG_LEVELS = ('A', 'B', 'C', 'D')
NO_RESIDUE_COVER = 'row_crops_sr_good'
RESIDUE_COVER = 'row_crops_sr_cr_good'

SOURCES = {
    'dem': 'Copernicus DEM GLO-30 (ESA, vía AWS Open Data)',
    'osm': 'OpenStreetMap (cursos de agua mapeados, ODbL)',
    'imerg': 'NASA GPM IMERG V07 (0,1°, 30 min)',
    'smap': 'NASA SMAP L3 SPL3SMP_E (9 km)',
    'mod16': 'NASA MODIS MOD16A2 (500 m, 8 días)',
    'mcd12q1': 'NASA MODIS MCD12Q1 (500 m, anual)',
    'soilgrids': 'ISRIC SoilGrids 2.0 (250 m)',
    'tr55': 'USDA NRCS TR-55 (1986)',
    'neh630': 'USDA NRCS NEH Parte 630, cap. 10, 15 y 16',
}

LIMITATIONS = [
    'No hay mediciones de caudal ni de nivel en esta cuenca: ningún resultado está validado '
    'contra observaciones. Son estimaciones de un modelo físico, no predicciones verificadas.',
    'El DEM es un modelo de superficie de 30 m (incluye árboles, edificios y terraplenes). En '
    'una llanura con pendientes de décimas de por ciento, su error vertical es del mismo orden '
    'que los desniveles reales: la divisoria y los cauces pueden no existir así en el terreno.',
    'Los caminos, alcantarillas y canales no mapeados en OpenStreetMap no están en el modelo y '
    'pueden cambiar por completo hacia dónde va el agua.',
    'IMERG es lluvia satelital en celdas de unos 10 km: no es la lluvia medida en el lote.',
    'El método SCS-CN y el hidrograma unitario se desarrollaron en cuencas de EE.UU.; el factor '
    'de pico 484 probablemente sobreestima el caudal en llanuras muy planas (NEH 630 cap. 16).',
    'Las zonas de acumulación son susceptibilidad topográfica relativa, no una simulación '
    'hidráulica: no dicen profundidad ni extensión de un anegamiento.',
    'No se entrenó un modelo de aprendizaje automático: sin caudales observados no hay con qué '
    'entrenarlo ni validarlo.',
]


class NotAvailable(Exception):
    """el lote está fuera de la ventana procesada o faltan los datos del pipeline"""


@lru_cache(maxsize=1)
def forcing() -> dict | None:
    path = terrain_mod.data_dir() / 'forcing.json'
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(float(value), digits)


def _terrain_or_fail(lot: Lot) -> terrain_mod.Terrain:
    t = terrain_mod.load()
    if t is None:
        raise NotAvailable('Faltan los datos de terreno del pipeline (data/hydrology).')
    west, south, east, north = t.meta['grid']['bounds']
    if not box(west, south, east, north).contains(shape(lot.geometry)):
        raise NotAvailable(
            'El análisis de Cuenca y Caudal está configurado para el Lote 3 (Casilda) y su '
            'entorno. Este lote queda fuera de la zona procesada.'
        )
    return t


# --- suelo y cobertura -------------------------------------------------------------------------


def soil_summary() -> dict:
    data = forcing()
    rules = parameters()['hydrologic_soil_groups']
    points = (data or {}).get('soil', {}).get('points', [])
    groups = []
    for p in points:
        texture = p.get('texture')
        hsg = rules['texture'].get(texture) or rules['unlisted'].get(texture)
        p['hsg'] = hsg
        if hsg:
            groups.append(hsg)
    counts = Counter(groups)
    hsg = counts.most_common(1)[0][0] if counts else None
    return {
        'hsg': hsg,
        'hsg_counts': dict(counts),
        'points': points,
        'source': SOURCES['soilgrids'],
        'method': f'Textura 0-30 cm a grupo hidrológico según {rules["source"]}. Se usa el '
        'grupo más frecuente entre los puntos de la zona.',
        'limitation': 'SoilGrids es un mapa predictivo global de 250 m, no un relevamiento de '
        'suelos del lote. La carta de suelos del INTA puede corregir el grupo.',
    }


def covers_for(t: terrain_mod.Terrain, cells: np.ndarray, hsg: str, residue: bool):
    """coberturas de la cuenca con su CN (ARC II) y la superficie de cada clase IGBP"""
    params = parameters()
    cn_table = params['curve_numbers']['covers']
    mapping_ = params['igbp_to_cover']['classes']
    labels = params['igbp_labels']
    area = t.cell_area[cells]
    if t.igbp is None:
        classes = np.full(cells.shape, 12)
    else:
        classes = t.igbp[cells]
    by_cover: dict[str, float] = {}
    by_class: dict[int, float] = {}
    for cls, a in zip(classes.tolist(), area.tolist(), strict=True):
        cover = mapping_.get(int(cls), RESIDUE_COVER)
        if cover == RESIDUE_COVER and not residue:
            cover = NO_RESIDUE_COVER
        by_cover[cover] = by_cover.get(cover, 0.0) + a
        by_class[int(cls)] = by_class.get(int(cls), 0.0) + a
    total = float(area.sum())
    shares = [
        CoverShare(
            key=k,
            label=cn_table[k]['label'],
            area_ha=v / 1e4,
            cn=float(cn_table[k]['cn'][hsg]),
        )
        for k, v in by_cover.items()
    ]
    land = [
        {
            'igbp': cls,
            'label': labels.get(cls, f'Clase {cls}'),
            'area_ha': round(a / 1e4, 1),
            'share': round(a / total, 3),
        }
        for cls, a in sorted(by_class.items(), key=lambda kv: -kv[1])
    ]
    return shares, land


# --- cuenca --------------------------------------------------------------------------------------


@lru_cache(maxsize=64)
def _basin(lot_id: int, geometry_key: str, outlet_idx: int | None) -> dict:
    lot = Lot.objects.get(pk=lot_id)
    t = _terrain_or_fail(lot)
    lot_cells = t.cell_mask(lot.geometry)
    if lot_cells.size == 0:
        raise NotAvailable('El lote es más chico que una celda del DEM.')
    in_lot = np.zeros(t.acc.shape, dtype=bool)
    in_lot[lot_cells] = True

    # cuenca aportante al lote: todo lo que escurre hacia alguna celda del lote
    contrib, _, _ = t.network.upstream(lot_cells)
    contrib_area = float(t.cell_area[contrib].sum())
    lot_area = float(t.cell_area[lot_cells].sum())

    down = t.network.down
    # ingresos: celdas de afuera cuyo flujo entra al lote; salidas: celdas del lote que lo dejan
    outside = contrib[~in_lot[contrib]]
    entries = outside[(down[outside] >= 0) & in_lot[np.maximum(down[outside], 0)]]
    exits = lot_cells[(down[lot_cells] < 0) | ~in_lot[np.maximum(down[lot_cells], 0)]]

    def points(cells: np.ndarray, kind: str) -> list[dict]:
        top = cells[np.argsort(-t.acc[cells])][: terrain_mod.TOP_POINTS]
        out = []
        for c in top:
            lat, lng = t.center(int(c))
            out.append(
                {
                    'kind': kind,
                    'lat': round(lat, 6),
                    'lng': round(lng, 6),
                    'upstream_ha': round(float(t.acc[c]) / 1e4, 1),
                }
            )
        return [p for p in out if p['upstream_ha'] >= 1.0] or out[:1]

    # punto de salida: el pedido (ya ajustado a la línea de flujo) o la salida principal del lote
    if outlet_idx is None:
        outlet_idx = int(exits[np.argmax(t.acc[exits])]) if exits.size else int(lot_cells[0])
    cells, parents, dist = t.network.upstream(np.array([outlet_idx]))
    cells_dem, _, _ = t.network_dem.upstream(np.array([outlet_idx]))
    area = float(t.cell_area[cells].sum())
    elev = t.dem[cells]
    p2, p98 = np.percentile(elev, [2, 98])
    slope_pct = float(np.average(t.tan_slope[cells], weights=t.cell_area[cells]) * 100)
    basin_poly = t.polygon(cells)
    contrib_poly = t.polygon(contrib)
    threshold = max(5e4, area / 6)
    stream_feats = terrain_mod.basin_streams(t, cells, threshold)
    # canales y arroyos mapeados en la cuenca y en una franja de unos 200 m a su alrededor
    osm_feats = terrain_mod.clip_lines(
        terrain_mod.osm_waterways(),
        contrib_poly.union(basin_poly).buffer(0.002),
        ('waterway', 'name', 'culvert'),
    )
    subs = terrain_mod.subbasins(t, cells, parents, threshold)
    outlet_lat, outlet_lng = t.center(outlet_idx)

    # IMERG: parte de la cuenca en cada celda de 0,1 grados
    imerg = (forcing() or {}).get('imerg', {}).get('cells')
    weights = None
    if imerg:
        lats = np.array([t.center(int(c))[0] for c in cells])
        lngs = np.array([t.center(int(c))[1] for c in cells])
        lon_c, lat_c = np.array(imerg['lon']), np.array(imerg['lat'])
        ii = np.abs(lngs[:, None] - lon_c[None, :]).argmin(axis=1)
        jj = np.abs(lats[:, None] - lat_c[None, :]).argmin(axis=1)
        w = np.zeros((lon_c.size, lat_c.size))
        np.add.at(w, (ii, jj), t.cell_area[cells])
        weights = (w / w.sum()).tolist()

    # flechas de dirección de flujo D8 alrededor del lote y de la cuenca, una cada 3 celdas
    both = np.concatenate([contrib, cells])
    rows_, cols_ = np.divmod(both, t.cols)
    margin = 8
    r0, r1 = max(0, rows_.min() - margin), min(t.rows - 1, rows_.max() + margin)
    c0, c1 = max(0, cols_.min() - margin), min(t.cols - 1, cols_.max() + margin)
    arrows = []
    for r in range(r0, r1 + 1, 3):
        for c in range(c0, c1 + 1, 3):
            idx = r * t.cols + c
            d = int(down[idx])
            if d < 0:
                continue
            a_lat, a_lng = t.center(idx)
            b_lat, b_lng = t.center(d)
            arrows.append([round(a_lat, 6), round(a_lng, 6), round(b_lat, 6), round(b_lng, 6)])

    return {
        'lot_cells': lot_cells,
        'cells': cells,
        'outlet_idx': outlet_idx,
        'imerg_weights': weights,
        'hydraulic_length_m': float(dist.max() + np.sqrt(t.cell_area[outlet_idx])),
        'slope_pct': slope_pct,
        'area_ha': area / 1e4,
        'summary': {
            'outlet': {
                'lat': round(outlet_lat, 6),
                'lng': round(outlet_lng, 6),
                'elevation_m': _round(t.dem[outlet_idx]),
            },
            'basin': {
                'area_ha': _round(area / 1e4),
                'outside_lot_ha': _round(float(t.cell_area[cells[~in_lot[cells]]].sum()) / 1e4),
                'lot_share': _round(float(t.cell_area[cells[in_lot[cells]]].sum()) / area, 3),
                'subbasins': len(subs),
                'mean_slope_pct': _round(slope_pct, 2),
                'relief_m': _round(p98 - p2, 1),
                'elevation_range_m': [_round(p2), _round(p98)],
                'hydraulic_length_m': round(float(dist.max())),
                'stream_length_m': round(sum(f['properties']['length_m'] for f in stream_feats)),
                'osm_length_m': round(sum(f['properties']['length_m'] for f in osm_feats)),
                'touches_window_edge': t.touches_edge(cells),
                'dem_only_area_ha': _round(float(t.cell_area[cells_dem].sum()) / 1e4),
                'geometry': mapping(basin_poly),
            },
            'contributing': {
                'area_ha': _round(contrib_area / 1e4),
                'lot_ha': _round(lot_area / 1e4),
                'outside_lot_ha': _round((contrib_area - lot_area) / 1e4),
                'touches_window_edge': t.touches_edge(contrib),
                'geometry': mapping(contrib_poly),
            },
            'subbasins': subs,
            'streams': {'type': 'FeatureCollection', 'features': stream_feats},
            'osm_waterways': {'type': 'FeatureCollection', 'features': osm_feats},
            'entries': points(entries, 'entry') if entries.size else [],
            'exits': points(exits, 'exit') if exits.size else [],
            'subbasin_threshold_ha': round(threshold / 1e4, 1),
            'flow_arrows': arrows,
        },
    }


def basin_for(lot: Lot, lat: float | None = None, lng: float | None = None) -> dict:
    t = _terrain_or_fail(lot)
    outlet = None
    if lat is not None and lng is not None:
        outlet = t.snap(lat, lng)
        if outlet is None:
            raise NotAvailable('El punto de salida queda fuera de la zona procesada.')
    key = json.dumps(lot.geometry, sort_keys=True)
    return _basin(lot.pk, key, outlet)


def inspection_sectors(t: terrain_mod.Terrain, lot_cells: np.ndarray) -> list[dict]:
    """sectores del lote con más potencial de acumular agua, para recorrer en el campo"""
    twi_cut = float(np.percentile(t.twi, 90))
    flagged = lot_cells[(t.twi[lot_cells] >= twi_cut) | (t.fill_depth[lot_cells] >= 0.1)]
    if flagged.size == 0:
        return []
    member = set(flagged.tolist())
    sectors = []
    seen: set[int] = set()
    for start in flagged.tolist():
        if start in seen:
            continue
        group, stack = [], [start]
        seen.add(start)
        while stack:
            c = stack.pop()
            group.append(c)
            r, k = divmod(c, t.cols)
            for dr, dc in terrain_mod.OFFSETS:
                n = (r + dr) * t.cols + (k + dc)
                if n in member and n not in seen:
                    seen.add(n)
                    stack.append(n)
        cells = np.array(group)
        area = float(t.cell_area[cells].sum()) / 1e4
        if area < 0.5:
            continue
        lat, lng = t.center(int(cells[np.argmax(t.acc[cells])]))
        depression = float(t.fill_depth[cells].max())
        sectors.append(
            {
                'lat': round(lat, 6),
                'lng': round(lng, 6),
                'area_ha': round(area, 1),
                'max_upstream_ha': round(float(t.acc[cells].max()) / 1e4, 1),
                'depression_m': round(depression, 2),
                'reason': (
                    'Bajo cerrado en el DEM y alto índice de humedad'
                    if depression >= 0.1
                    else 'Alto índice topográfico de humedad (el flujo converge y hay poca '
                    'pendiente)'
                ),
                'geometry': mapping(t.polygon(cells)),
            }
        )
    sectors.sort(key=lambda s: -s['area_ha'])
    return sectors[:8]


def analysis(lot: Lot, lat: float | None = None, lng: float | None = None) -> dict:
    t = _terrain_or_fail(lot)
    b = basin_for(lot, lat, lng)
    soil = soil_summary()
    hsg = soil['hsg'] or 'B'
    covers, land = covers_for(t, b['cells'], hsg, residue=True)
    cn = weighted_cn(covers)
    grid = t.meta['grid']
    west, south, east, north = grid['bounds']
    layers_url = '/media/hydrology/lote3/'
    summary = b['summary']
    summary['basin']['land_cover'] = land
    summary['basin']['cn_arc_ii'] = round(cn, 1)
    return {
        'lot': lot.pk,
        'configured_for': t.meta.get('lot'),
        **summary,
        'inspection': {
            'sectors': inspection_sectors(t, b['lot_cells']),
            'method': 'Celdas del lote con índice topográfico de humedad (TWI, Beven y Kirkby '
            '1979) en el 10 % más alto de la zona, o bajos cerrados de 10 cm o más según el DEM '
            'rellenado. Se agrupan las vecinas y se descartan los grupos de menos de 0,5 ha.',
            'limitation': 'Es susceptibilidad relativa: marca dónde conviene mirar, no si se '
            'anega ni con qué profundidad.',
        },
        'layers': {
            'bounds': [[south, west], [north, east]],
            'flow_accumulation': layers_url + 'flow_accumulation.png',
            'twi': layers_url + 'twi.png',
            'depressions': layers_url + 'depressions.png',
        },
        'soil': soil,
        'parameters': {
            'terrain': t.meta['parameters'],
            'methods': t.meta['methods'],
            'cover_assumption': parameters()['igbp_to_cover']['assumption'],
            'curve_number_source': parameters()['curve_numbers']['source'],
        },
        'sources': {
            'dem': t.meta['sources']['dem'],
            'osm': t.meta['sources']['osm'],
            'land_cover': (forcing() or {}).get('land_cover'),
            'generated_at': t.meta['generated_at'],
        },
        'limitations': LIMITATIONS,
    }


# --- modelo lluvia-caudal ------------------------------------------------------------------------


def _model(
    b: dict, rain_steps: list[float], step_h: float, hsg: str, arc: str, residue: bool
) -> dict:
    t = terrain_mod.load()
    covers, _ = covers_for(t, b['cells'], hsg, residue)
    cn_ii = weighted_cn(covers)
    lag, notes = lag_hours(b['hydraulic_length_m'], cn_ii, max(b['slope_pct'], 0.01))
    area_ha = b['area_ha']
    lag_cfg = parameters()['lag']
    if area_ha / 100 > lag_cfg['max_area_km2']:
        notes.append(
            f'La cuenca ({area_ha / 100:.1f} km²) supera el área para la que se probó la '
            'ecuación de retardo (unos 49 km²).'
        )
    step = step_for(lag, step_h)
    rain = resample(rain_steps, step_h, step)
    excess = basin_excess(rain, covers, arc)
    q_mm = sum(excess)
    hydro = route(excess, step, area_ha / 100, lag, notes)
    total_rain = sum(rain_steps)
    return {
        'rain_mm': round(total_rain, 1),
        'runoff_mm': round(q_mm, 2),
        'runoff_coefficient': round(q_mm / total_rain, 3) if total_rain > 0 else None,
        'volume_m3': round(q_mm * area_ha * 10),
        'peak_m3s': round(hydro.peak_m3s, 3),
        'time_to_peak_h': round(hydro.time_to_peak_h, 2),
        'lag_h': round(hydro.lag_h, 2),
        'cn_arc_ii': round(cn_ii, 1),
        'cn_used': round(sum(c.area_ha * c.cn for c in covers) / sum(c.area_ha for c in covers), 1)
        if arc == 'II'
        else None,
        'arc': arc,
        'hsg': hsg,
        'step_h': round(step, 4),
        'hydrograph': {
            'times_h': hydro.times_h,
            'flow_m3s': [round(q, 4) for q in hydro.flow_m3s],
        },
        'hyetograph_mm': [round(r, 3) for r in rain],
        'notes': hydro.notes,
    }


def simulate(
    lot: Lot,
    rain_mm: float,
    duration_h: float,
    arc: str = 'II',
    hsg: str | None = None,
    residue: bool = True,
    lat: float | None = None,
    lng: float | None = None,
) -> dict:
    b = basin_for(lot, lat, lng)
    soil = soil_summary()
    hsg = hsg or soil['hsg'] or 'B'
    step_h = 0.5 if duration_h >= 0.5 else duration_h
    n = max(1, round(duration_h / step_h))
    rain = [rain_mm / n] * n
    main = _model(b, rain, step_h, hsg, arc, residue)
    band = {level: _model(b, rain, step_h, hsg, level, residue) for level in ARC_LEVELS}
    return {
        'scenario': {
            'rain_mm': rain_mm,
            'duration_h': duration_h,
            'distribution': 'uniforme',
            'arc': arc,
            'hsg': hsg,
            'residue': residue,
            'kind': 'Escenario hipotético',
        },
        'outlet': b['summary']['outlet'],
        'basin_area_ha': round(b['area_ha'], 1),
        'result': main,
        'range': {
            level: {
                'runoff_mm': r['runoff_mm'],
                'volume_m3': r['volume_m3'],
                'peak_m3s': r['peak_m3s'],
            }
            for level, r in band.items()
        },
        'method': 'Escorrentía SCS-CN (TR-55; NEH 630 cap. 10) por cobertura, retardo de '
        'Mockus (NEH 630 cap. 15, ec. 15-4a) e hidrograma unitario adimensional SCS (NEH 630 '
        'cap. 16, Tabla 16-1, factor de pico 484). Lluvia repartida en partes iguales.',
        'disclaimer': 'Escenario hipotético, no es un pronóstico meteorológico. Resultado sin '
        'validar: no hay caudales medidos en la cuenca.',
    }


# --- historial ----------------------------------------------------------------------------------


def _weighted(grid: list[list[float]] | None, weights: list[list[float]]) -> float | None:
    if grid is None:
        return None
    return float(
        sum(
            g * w for gr, wr in zip(grid, weights, strict=True) for g, w in zip(gr, wr, strict=True)
        )
    )


def history(lot: Lot, lat: float | None = None, lng: float | None = None) -> dict:
    data = forcing()
    if not data:
        raise NotAvailable('Faltan los datos de lluvia del pipeline (forcing.json).')
    b = basin_for(lot, lat, lng)
    weights = b['imerg_weights']
    soil = soil_summary()
    hsg = soil['hsg'] or 'B'
    daily = {d['date']: _weighted(d['mm'], weights) for d in data['imerg']['daily']}
    et = [e for e in data['et']['series'] if e['et_mm'] is not None]
    events = []
    for ev in data['events']:
        steps = [_weighted(s, weights) or 0.0 for s in ev['mm']]
        missing = sum(1 for s in ev['mm'] if s is None)
        start = datetime.fromisoformat(ev['start'].replace('Z', '+00:00'))
        end = datetime.fromisoformat(ev['end'].replace('Z', '+00:00'))
        first_day = start.date()
        antecedent = [daily.get((first_day - timedelta(days=k)).isoformat()) for k in range(1, 6)]
        et_before = [
            e for e in et if date.fromisoformat(e['start']) <= first_day - timedelta(days=1)
        ]
        model = {level: _model(b, steps, ev['step_h'], hsg, level, True) for level in ARC_LEVELS}
        mid = model['II']
        events.append(
            {
                'start': ev['start'],
                'end': ev['end'],
                'run': ev['run'],
                'rain_mm': round(sum(steps), 1),
                'max_intensity_mm_h': round(max(steps) / ev['step_h'], 1) if steps else None,
                'duration_h': round((end - start).total_seconds() / 3600, 1),
                'missing_steps': missing,
                'antecedent_5d_mm': _round(sum(a for a in antecedent if a is not None))
                if any(a is not None for a in antecedent)
                else None,
                'smap': ev.get('smap'),
                'et_before': {
                    'start': et_before[-1]['start'],
                    'et_mm_8d': et_before[-1]['et_mm'],
                    'product': et_before[-1]['product'],
                }
                if et_before
                else None,
                'runoff_mm': mid['runoff_mm'],
                'volume_m3': mid['volume_m3'],
                'peak_m3s': mid['peak_m3s'],
                'time_to_peak_h': mid['time_to_peak_h'],
                'range': {
                    level: {
                        'runoff_mm': r['runoff_mm'],
                        'volume_m3': r['volume_m3'],
                        'peak_m3s': r['peak_m3s'],
                    }
                    for level, r in model.items()
                },
                'hyetograph_mm': [round(s, 2) for s in steps],
                'step_h': ev['step_h'],
                'hydrograph': mid['hydrograph'],
            }
        )
    events.sort(key=lambda e: e['start'], reverse=True)
    rain_by_month: dict[str, float] = {}
    for d, v in daily.items():
        if v is not None:
            rain_by_month[d[:7]] = rain_by_month.get(d[:7], 0.0) + v
    imerg = data['imerg']
    return {
        'lot': lot.pk,
        'outlet': b['summary']['outlet'],
        'basin_area_ha': round(b['area_ha'], 1),
        'hsg': hsg,
        'events': events,
        'monthly_rain': [{'month': m, 'mm': round(v, 1)} for m, v in sorted(rain_by_month.items())],
        'selection': f'Eventos con al menos {imerg["event_day_mm"]:.0f} mm en un día en la celda '
        f'IMERG del lote, separados por {imerg["dry_gap_h"]:.0f} h sin lluvia.',
        'sources': {
            'rain': f'{imerg["daily_product"]}; eventos con {imerg["half_hourly_product"]}. La '
            f'versión Final llega hasta {imerg["final_until"]}; después se usa la Late, '
            'preliminar.',
            'soil_moisture': SOURCES['smap'],
            'et': data['et']['product'],
            'generated_at': data['generated_at'],
        },
        'method': 'Cada evento se calcula con la lluvia IMERG ponderada por la parte de la cuenca '
        'en cada celda, en condición antecedente media (ARC II) y con el rango seco (I) a húmedo '
        '(III). La humedad SMAP y la lluvia de 5 días previos se muestran como contexto.',
        'validation': 'Sin caudales ni niveles observados en la cuenca: no se pueden calcular '
        'NSE, RMSE, sesgo de volumen ni error de pico. Los valores son simulaciones.',
    }
