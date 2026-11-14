"""Extrae la serie temporal NISAR GCOV (HH y HV) de cada lote.

Lee solo la ventana de cada lote en los HDF5 remotos (sin descargar la escena completa).
Es reanudable: si una escena ya tiene sus recortes guardados, la saltea.
Salida en pipeline/output/ (ignorada por git):
- chips/<lote>_<fecha>.npz: recortes HH, HV y máscara alrededor de cada lote.
- nisar_timeseries.csv: gamma0 medio por lote, fecha y polarización.

Uso: python scripts/extract_nisar.py [--path 111] [--frame 105]
"""

import argparse
import csv
import json
from pathlib import Path

import asf_search as asf
import edl
import numpy as np
import shapely
from pyproj import Transformer
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import shape

PIPELINE_DIR = Path(__file__).resolve().parents[1]
OUTPUT = PIPELINE_DIR / 'output'
CHIPS = OUTPUT / 'chips'
GRID = '/science/LSAR/GCOV/grids/frequencyA'
MARGIN_M = 1000  # contexto alrededor del lote para las imágenes de evidencia
ATTEMPTS = 3


def read_lots() -> list[dict]:
    return json.loads((PIPELINE_DIR / 'lots.geojson').read_text())['features']


def lots_in_crs(crs: str) -> dict[str, shapely.Geometry]:
    to_utm = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    return {
        f['properties']['id']: shapely.transform(
            shape(f['geometry']),
            lambda xy, t=to_utm: np.column_stack(t.transform(xy[:, 0], xy[:, 1])),
        )
        for f in read_lots()
    }


def search(path: int, frame: int) -> list:
    area = shapely.union_all([shape(f['geometry']) for f in read_lots()]).envelope
    results = asf.search(
        dataset='NISAR',
        processingLevel='GCOV',
        intersectsWith=area.wkt,
        start='2026-06-01',
    )
    scenes = [
        r
        for r in results
        if r.properties['pathNumber'] == path and r.properties['frameNumber'] == frame
    ]
    return sorted(scenes, key=lambda r: r.properties['startTime'])


def chip_path(lot_id: str, date: str) -> Path:
    return CHIPS / f'{lot_id}_{date}.npz'


def extract_scene(url: str, date: str, token: str) -> None:
    """Guarda los recortes HH, HV y máscara de cada lote para una escena."""
    with edl.open_remote_h5(url, token) as f:
        grid = f[GRID]
        epsg = int(grid['projection'].attrs['epsg_code'])
        xs = grid['xCoordinates'][:]
        ys = grid['yCoordinates'][:]
        dx, dy = xs[1] - xs[0], ys[1] - ys[0]
        for lot_id, poly in lots_in_crs(f'EPSG:{epsg}').items():
            minx, miny, maxx, maxy = poly.buffer(MARGIN_M).bounds
            cols = np.where((xs >= minx) & (xs <= maxx))[0]
            rows = np.where((ys >= miny) & (ys <= maxy))[0]
            c0, c1, r0, r1 = cols.min(), cols.max() + 1, rows.min(), rows.max() + 1
            hh = grid['HHHH'][r0:r1, c0:c1]
            hv = grid['HVHV'][r0:r1, c0:c1]
            mask = grid['mask'][r0:r1, c0:c1]
            # Las coordenadas son centros de píxel: el origen es la esquina superior izquierda
            transform = from_origin(xs[c0] - dx / 2, ys[r0] - dy / 2, dx, -dy)
            inside = features.geometry_mask([poly], hh.shape, transform, invert=True)
            np.savez_compressed(
                chip_path(lot_id, date),
                hh=hh,
                hv=hv,
                mask=mask,
                inside=inside,
                transform=np.array(transform)[:6],
                epsg=epsg,
            )


def build_rows(scenes: list) -> list[dict]:
    """Calcula gamma0 medio por lote a partir de los recortes guardados."""
    rows = []
    for scene in scenes:
        p = scene.properties
        date = p['startTime'][:10]
        maturity = 'VALIDATED' if p['collectionName'] == 'NISAR_L2_GCOV_V1' else 'PROVISIONAL'
        for f in read_lots():
            lot_id = f['properties']['id']
            if not chip_path(lot_id, date).exists():
                continue
            d = np.load(chip_path(lot_id, date))
            valid = d['inside'] & (d['mask'] > 0) & (d['mask'] < 255)
            for pol in ('HH', 'HV'):
                vals = d[pol.lower()][valid]
                vals = vals[np.isfinite(vals) & (vals > 0)]
                # Promedio en potencia lineal y después a dB
                rows.append(
                    {
                        'lot': lot_id,
                        'date': date,
                        'pol': pol,
                        'gamma0_db': round(10 * np.log10(vals.mean()), 3) if vals.size else '',
                        'std_db': round(float(np.std(10 * np.log10(vals))), 3) if vals.size else '',
                        'n_pixels': int(vals.size),
                        'maturity': maturity,
                        'scene': p['sceneName'],
                    }
                )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', type=int, default=111)
    parser.add_argument('--frame', type=int, default=105)
    args = parser.parse_args()

    CHIPS.mkdir(parents=True, exist_ok=True)
    scenes = search(args.path, args.frame)
    print(f'{len(scenes)} escenas en path {args.path} frame {args.frame}', flush=True)
    lot_ids = [f['properties']['id'] for f in read_lots()]

    for scene in scenes:
        p = scene.properties
        date = p['startTime'][:10]
        if all(chip_path(lot_id, date).exists() for lot_id in lot_ids):
            print(date, 'ya extraída', flush=True)
            continue
        for attempt in range(1, ATTEMPTS + 1):
            try:
                # Token y conexión nuevos en cada intento: los enlaces firmados vencen
                extract_scene(p['url'], date, edl.get_token())
                print(date, 'ok', flush=True)
                break
            except Exception as exc:  # noqa: BLE001 - errores de red de varios tipos
                print(date, f'intento {attempt} falló: {type(exc).__name__}', flush=True)
        else:
            print(date, f'SE OMITE: falló {ATTEMPTS} veces', flush=True)

    rows = build_rows(scenes)
    with open(OUTPUT / 'nisar_timeseries.csv', 'w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} filas en {OUTPUT / "nisar_timeseries.csv"}', flush=True)


if __name__ == '__main__':
    main()
