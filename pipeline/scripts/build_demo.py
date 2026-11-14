"""Detecta eventos y arma los JSON de importación y las imágenes de evidencia.

Entrada (pipeline/output/, generada por extract_nisar.py y extract_hls.py):
- chips/<lote>_<fecha>.npz y hls_chips/<lote>_<fecha>_<producto>.npz

Salida:
- data/demo/<lote>.json con el contrato de CLAUDE.md, sección 8.
- data/evidence/<lote>_<fecha>_nisar.png y <lote>_<fecha>_hls.png (mismo encuadre).
- pipeline/output/detection_report.csv con la anomalía de cada lote y fecha.

Método (prueba de concepto, no validado):
1. Backscatter medio del lote (gamma0, promedio en potencia lineal, en dB).
2. Anomalía = lote menos la mediana del paisaje alrededor de los 4 lotes en la misma fecha.
   Así se descartan cambios que afectan a toda la zona (por ejemplo, lluvia).
3. Se excluyen las fechas en que todo el paisaje se aparta de su mediana temporal más de
   MAD_K desvíos absolutos medianos (por ejemplo, el 2026-10-07: NASA POWER registra 46 mm
   de lluvia ese día y el suelo mojado sube el backscatter de toda la zona).
4. Umbral: el cambio de anomalía en HH entre fechas consecutivas tiene que superar
   K veces el desvío estándar de la anomalía en los lotes sin cambios visibles
   (referencia), y mantenerse en la fecha siguiente.
Umbral K y lotes de referencia son una propuesta del pipeline: el equipo los tiene que validar.

Uso: python scripts/build_demo.py
"""

import csv
import itertools
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from shapely.geometry import shape

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent
OUTPUT = PIPELINE_DIR / 'output'
DEMO = REPO_DIR / 'data' / 'demo'
EVIDENCE = REPO_DIR / 'data' / 'evidence'

K_SIGMA = 3.0  # propuesta, sin validar
MAD_K = 5.0  # propuesta, sin validar
REFERENCE_LOTS = ('lote2', 'lote4')  # sin cambios visibles en NDVI en todo el período
MIN_CLEAR = 0.9  # fracción mínima del lote sin nubes para usar una fecha HLS
# NDVI de 0,6 a 0,9 corresponde a vegetación densa (USGS, "NDVI, the Foundation for Remote
# Sensing Phenology"). Se usa para registrar que hubo un cultivo, no su especie.
DENSE_VEGETATION_NDVI = 0.6
EVIDENCE_MARGIN_M = 600
EVIDENCE_PX = 600


def load_lots() -> dict[str, dict]:
    data = json.loads((PIPELINE_DIR / 'lots.geojson').read_text())
    return {f['properties']['id']: f for f in data['features']}


def nisar_series() -> tuple[dict, dict, list[str]]:
    """Devuelve (valor del lote, valor del paisaje) por (lote, pol) y fecha, en dB."""
    lot_db: dict = defaultdict(dict)
    landscape: dict = defaultdict(lambda: {'HH': [], 'HV': []})
    for chip in sorted((OUTPUT / 'chips').glob('*.npz')):
        lot_id, date = chip.stem.split('_')
        d = np.load(chip)
        valid = (d['mask'] > 0) & (d['mask'] < 255)
        for pol in ('HH', 'HV'):
            arr = d[pol.lower()]
            ok = valid & np.isfinite(arr) & (arr > 0)
            landscape[date][pol].append(arr[ok])
            inside = arr[ok & d['inside']]
            lot_db[(lot_id, pol)][date] = 10 * np.log10(inside.mean())
    dates = sorted(landscape)
    ref = {
        date: {
            p: 10 * np.log10(np.median(np.concatenate(landscape[date][p]))) for p in ('HH', 'HV')
        }
        for date in dates
    }
    return lot_db, ref, dates


def hls_series() -> dict:
    """NDVI medio por lote y fecha (solo fechas con el lote despejado)."""
    out: dict = defaultdict(dict)
    with open(OUTPUT / 'hls_timeseries.csv') as fh:
        for r in csv.DictReader(fh):
            if r['ndvi'] and float(r['clear_fraction']) >= MIN_CLEAR:
                out[r['lot']][(r['date'], r['product'])] = float(r['ndvi'])
    return out


def wet_dates(ref: dict, dates: list[str]) -> list[str]:
    """Fechas en que el HH de todo el paisaje se aparta de su mediana temporal."""
    hh = np.array([ref[d]['HH'] for d in dates])
    median = np.median(hh)
    mad = np.median(np.abs(hh - median))
    return [d for d, v in zip(dates, hh, strict=True) if abs(v - median) > MAD_K * mad]


def detect(
    lot_db: dict, ref: dict, all_dates: list[str]
) -> tuple[list[dict], list[dict], list[str]]:
    excluded = wet_dates(ref, all_dates)
    dates = [d for d in all_dates if d not in excluded]
    anomaly = {
        key: {d: float(series[d] - ref[d][key[1]]) for d in all_dates}
        for key, series in lot_db.items()
    }
    # Variabilidad de la anomalía en los lotes de referencia, entre fechas consecutivas
    steps = [
        anomaly[(lot, 'HH')][b] - anomaly[(lot, 'HH')][a]
        for lot in REFERENCE_LOTS
        for a, b in itertools.pairwise(dates)
    ]
    sigma = float(np.std(steps))
    threshold = K_SIGMA * sigma
    report, detections = [], []
    for (lot_id, pol), series in sorted(anomaly.items()):
        for date in all_dates:
            report.append(
                {
                    'lot': lot_id,
                    'pol': pol,
                    'date': date,
                    'lot_db': round(lot_db[(lot_id, pol)][date], 2),
                    'landscape_db': round(ref[date][pol], 2),
                    'anomaly_db': round(series[date], 2),
                    'excluded': date in excluded,
                }
            )
        if pol != 'HH':
            continue
        for i in range(1, len(dates) - 1):
            before, date, after = dates[i - 1], dates[i], dates[i + 1]
            step = series[date] - series[before]
            # Persistente: la fecha siguiente sigue del mismo lado del cambio
            persists = (
                np.sign(series[after] - series[before]) == np.sign(step)
                and abs(series[after] - series[before]) >= threshold
            )
            if abs(step) >= threshold and persists and lot_id not in REFERENCE_LOTS:
                detections.append(
                    {
                        'lot': lot_id,
                        'before': before,
                        'after': date,
                        'hh_step': step,
                        'hv_step': anomaly[(lot_id, 'HV')][date] - anomaly[(lot_id, 'HV')][before],
                        'threshold': threshold,
                        'sigma': sigma,
                    }
                )
                break  # un evento por lote: el primer cambio persistente
    return detections, report, excluded


def outline_pixels(geom, transform: Affine) -> list[tuple[float, float]]:
    inv = ~transform
    return [inv * (x, y) for x, y in geom.exterior.coords]


def resample_to(
    src: np.ndarray, src_tr: Affine, dst_tr: Affine, src_epsg: int, dst_epsg: int
) -> np.ndarray:
    """Remuestrea al encuadre de evidencia. HLS usa UTM norte aun en el hemisferio sur."""
    dst = np.full((EVIDENCE_PX, EVIDENCE_PX), np.nan, dtype='float32')
    reproject(
        src.astype('float32'),
        dst,
        src_transform=src_tr,
        dst_transform=dst_tr,
        src_crs=f'EPSG:{src_epsg}',
        dst_crs=f'EPSG:{dst_epsg}',
        src_nodata=np.nan,
        dst_nodata=np.nan,
        resampling=Resampling.nearest,
    )
    return dst


def stretch(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return (np.nan_to_num(np.clip((a - lo) / (hi - lo), 0, 1)) * 255).astype('uint8')


def save_png(rgb: np.ndarray, geom, transform: Affine, label: str, path: Path) -> None:
    img = Image.fromarray(rgb)
    draw = ImageDraw.Draw(img)
    pts = outline_pixels(geom, transform)
    draw.line(pts + [pts[0]], fill=(255, 230, 0), width=3)
    draw.rectangle([0, EVIDENCE_PX - 22, EVIDENCE_PX, EVIDENCE_PX], fill=(0, 0, 0))
    draw.text((6, EVIDENCE_PX - 18), label, fill=(255, 255, 255))
    img.save(path, optimize=True)


def evidence(lot_id: str, lot: dict, nisar_date: str, hls_key: tuple[str, str]) -> tuple[str, str]:
    d = np.load(OUTPUT / 'chips' / f'{lot_id}_{nisar_date}.npz')
    epsg = int(d['epsg'])
    to_utm = Transformer.from_crs('EPSG:4326', f'EPSG:{epsg}', always_xy=True)
    ring = [to_utm.transform(x, y) for x, y in lot['geometry']['coordinates'][0]]
    geom = shape({'type': 'Polygon', 'coordinates': [ring]})
    minx, miny, maxx, maxy = geom.buffer(EVIDENCE_MARGIN_M).bounds
    side = max(maxx - minx, maxy - miny)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    px = side / EVIDENCE_PX
    dst_tr = Affine(px, 0, cx - side / 2, 0, -px, cy + side / 2)

    # Radar: composición en falso color HH, HV, HH/HV (dB)
    src_tr = Affine(*d['transform'])
    valid = (d['mask'] > 0) & (d['mask'] < 255)
    hh = np.where(valid & (d['hh'] > 0), 10 * np.log10(np.where(d['hh'] > 0, d['hh'], 1)), np.nan)
    hv = np.where(valid & (d['hv'] > 0), 10 * np.log10(np.where(d['hv'] > 0, d['hv'], 1)), np.nan)
    hh_r = resample_to(hh, src_tr, dst_tr, epsg, epsg)
    hv_r = resample_to(hv, src_tr, dst_tr, epsg, epsg)
    radar = np.dstack(
        [stretch(hh_r, -22, -4), stretch(hv_r, -30, -16), stretch(hh_r - hv_r, 4, 16)]
    )
    radar_name = f'{lot_id}_{nisar_date}_nisar.png'
    save_png(
        radar,
        geom,
        dst_tr,
        f'NISAR GCOV {nisar_date}  R:HH G:HV B:HH/HV',
        EVIDENCE / radar_name,
    )

    # Óptico: color natural HLS
    date, product = hls_key
    h = np.load(OUTPUT / 'hls_chips' / f'{lot_id}_{date}_{product}.npz')
    h_tr = Affine(*h['transform'])
    bands = [
        resample_to(h[b].astype(float) * 0.0001, h_tr, dst_tr, int(h['epsg']), epsg)
        for b in ('red', 'green', 'blue')
    ]
    optical = np.dstack([stretch(b, 0.01, 0.18) for b in bands])
    optical_name = f'{lot_id}_{date}_hls.png'
    save_png(
        optical,
        geom,
        dst_tr,
        f'HLS {product} {date}  color natural',
        EVIDENCE / optical_name,
    )
    return f'evidence/{radar_name}', f'evidence/{optical_name}'


def nearest_hls(ndvi: dict, target: str) -> tuple[str, str]:
    return min(ndvi, key=lambda k: abs(np.datetime64(k[0]) - np.datetime64(target)))


def main() -> None:
    DEMO.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    lots = load_lots()
    lot_db, ref, dates = nisar_series()
    ndvi = hls_series()
    detections, report, excluded = detect(lot_db, ref, dates)
    print(
        'Fechas excluidas por cambio en todo el paisaje:',
        ', '.join(excluded) or 'ninguna',
    )

    with open(OUTPUT / 'detection_report.csv', 'w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(report[0]))
        writer.writeheader()
        writer.writerows(report)

    for det in detections:
        print(
            f'{det["lot"]}: cambio HH {det["hh_step"]:+.2f} dB entre {det["before"]} y '
            f'{det["after"]} (umbral {det["threshold"]:.2f} dB = {K_SIGMA} x {det["sigma"]:.2f})'
        )
    by_lot = {d['lot']: d for d in detections}

    for lot_id, lot in lots.items():
        props = lot['properties']
        events = []
        det = by_lot.get(lot_id)
        if det:
            before, after = np.datetime64(det['before']), np.datetime64(det['after'])
            mid = before + (after - before) // 2
            uncertainty = int((after - before) / np.timedelta64(1, 'D') // 2)
            series = ndvi.get(lot_id, {})
            # NDVI despejado más cercano antes del cambio y el último disponible después
            ndvi_before = [(d, v) for (d, _), v in sorted(series.items()) if d <= det['before']]
            ndvi_after = [(d, v) for (d, _), v in sorted(series.items()) if d > det['after']]
            radar_png, optical_png = evidence(
                lot_id, lot, det['after'], nearest_hls(series, det['after'])
            )
            events.append(
                {
                    'type': 'SOWING',
                    'date': str(mid),
                    'date_uncertainty_days': uncertainty,
                    'sensor': 'NISAR',
                    'origin': 'VERIFIED',
                    'confidence': None,
                    'campaign': '2026/27',
                    'evidence_image': radar_png,
                    'evidence_optical_image': optical_png,
                    'metrics': {
                        'nisar_product': 'GCOV',
                        'nisar_track': 'path 111 frame 105 descendente',
                        'dates_compared': [det['before'], det['after']],
                        'hh_anomaly_change_db': round(det['hh_step'], 2),
                        'hv_anomaly_change_db': round(det['hv_step'], 2),
                        'threshold_db': round(det['threshold'], 2),
                        'threshold_rule': f'{K_SIGMA} x desvío de lotes de referencia',
                        'threshold_validated': False,
                        'ndvi_before': round(ndvi_before[-1][1], 2) if ndvi_before else None,
                        'ndvi_before_date': ndvi_before[-1][0] if ndvi_before else None,
                        'ndvi_last': round(ndvi_after[-1][1], 2) if ndvi_after else None,
                        'ndvi_last_date': ndvi_after[-1][0] if ndvi_after else None,
                        'optical_sensor': 'HLS',
                    },
                    'is_simulated': False,
                    'notes': (
                        'Cambio de superficie detectado por radar (baja de HH frente al '
                        'paisaje) seguido de suba de HV y, semanas después, de NDVI: '
                        'compatible con siembra. No se puede descartar una labranza previa. '
                        'Prueba de concepto, sin validar en campo.'
                    ),
                }
            )
        campaigns = []
        if det:
            # Siembra a principios de septiembre: en la Zona Núcleo suele ser maíz temprano.
            # Es una inferencia por calendario regional, por eso el origen es ESTIMATED.
            campaigns.append({'label': '2026/27', 'crop': 'CORN', 'crop_origin': 'ESTIMATED'})
        elif max(ndvi.get(lot_id, {}).values(), default=0) >= DENSE_VEGETATION_NDVI:
            # Se observó un cultivo de invierno, pero no se puede identificar la especie.
            campaigns.append({'label': '2026/27', 'crop': 'OTHER', 'crop_origin': 'VERIFIED'})
        data = {
            'lot': {
                'name': props['name'],
                'renspa': None,
                'locality': props['locality'],
                'province': props['province'],
                'geometry': lot['geometry'],
            },
            'campaigns': campaigns,
            'events': events,
        }
        path = DEMO / f'{lot_id}.json'
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print(f'{path.relative_to(REPO_DIR)}: {len(events)} eventos')


if __name__ == '__main__':
    main()
