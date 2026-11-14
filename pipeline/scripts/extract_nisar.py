"""Extrae la serie temporal NISAR GCOV (HH y HV) de cada lote.

Lee solo la ventana de cada lote en los HDF5 remotos (sin descargar la escena completa).
Salida en pipeline/output/ (ignorada por git):
- nisar_timeseries.csv: gamma0 medio por lote, fecha y polarización.
- chips/<lote>_<fecha>.npz: recortes HH, HV y máscara alrededor de cada lote.

Uso: python scripts/extract_nisar.py [--path 111] [--frame 105]
"""

import argparse
import csv
import json
from pathlib import Path

import asf_search as asf
import numpy as np
import shapely
from pyproj import Transformer
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import shape

import edl

PIPELINE_DIR = Path(__file__).resolve().parents[1]
OUTPUT = PIPELINE_DIR / 'output'
GRID = '/science/LSAR/GCOV/grids/frequencyA'
MARGIN_M = 1000  # contexto alrededor del lote para las imágenes de evidencia


def load_lots(crs: str) -> dict[str, shapely.Geometry]:
    data = json.loads((PIPELINE_DIR / 'lots.geojson').read_text())
    to_utm = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    lots = {}
    for feature in data['features']:
        geom = shape(feature['geometry'])
        lots[feature['properties']['id']] = shapely.transform(
            geom, lambda xy: np.column_stack(to_utm.transform(xy[:, 0], xy[:, 1]))
        )
    return lots


def search(path: int, frame: int) -> list:
    lots = json.loads((PIPELINE_DIR / 'lots.geojson').read_text())
    area = shapely.union_all([shape(f['geometry']) for f in lots['features']]).envelope
    results = asf.search(
        dataset='NISAR', processingLevel='GCOV', intersectsWith=area.wkt, start='2026-06-01'
    )
    scenes = [
        r for r in results if r.properties['pathNumber'] == path and r.properties['frameNumber'] == frame
    ]
    return sorted(scenes, key=lambda r: r.properties['startTime'])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', type=int, default=111)
    parser.add_argument('--frame', type=int, default=105)
    args = parser.parse_args()

    (OUTPUT / 'chips').mkdir(parents=True, exist_ok=True)
    token = edl.get_token()
    scenes = search(args.path, args.frame)
    print(f'{len(scenes)} escenas en path {args.path} frame {args.frame}')

    rows = []
    for scene in scenes:
        p = scene.properties
        date = p['startTime'][:10]
        maturity = p['collectionName'].replace('NISAR_L2_GCOV_', '').replace('_V1', '') or 'V1'
        with edl.open_remote_h5(p['url'], token) as f:
            grid = f[GRID]
            epsg = int(grid['projection'].attrs['epsg_code'])
            xs = grid['xCoordinates'][:]
            ys = grid['yCoordinates'][:]
            dx, dy = xs[1] - xs[0], ys[1] - ys[0]
            lots = load_lots(f'EPSG:{epsg}')
            for lot_id, poly in lots.items():
                minx, miny, maxx, maxy = poly.buffer(MARGIN_M).bounds
                cols = np.where((xs >= minx) & (xs <= maxx))[0]
                rws = np.where((ys >= miny) & (ys <= maxy))[0]
                c0, c1, r0, r1 = cols.min(), cols.max() + 1, rws.min(), rws.max() + 1
                hh = grid['HHHH'][r0:r1, c0:c1]
                hv = grid['HVHV'][r0:r1, c0:c1]
                mask = grid['mask'][r0:r1, c0:c1]
                # Coordenadas en el centro del píxel: el origen es la esquina superior izquierda
                transform = from_origin(xs[c0] - dx / 2, ys[r0] - dy / 2, dx, -dy)
                inside = features.geometry_mask(
                    [poly], hh.shape, transform, invert=True, all_touched=False
                )
                valid = inside & (mask > 0) & (mask < 255) & np.isfinite(hh) & (hh > 0)
                np.savez_compressed(
                    OUTPUT / 'chips' / f'{lot_id}_{date}.npz',
                    hh=hh, hv=hv, mask=mask, inside=inside,
                    transform=np.array(transform)[:6], epsg=epsg,
                )
                for pol, arr in (('HH', hh), ('HV', hv)):
                    vals = arr[valid]
                    mean_lin = float(vals.mean()) if vals.size else float('nan')
                    rows.append({
                        'lot': lot_id,
                        'date': date,
                        'pol': pol,
                        'gamma0_db': round(10 * np.log10(mean_lin), 3) if vals.size else '',
                        'std_db': round(float(np.std(10 * np.log10(vals))), 3) if vals.size else '',
                        'n_pixels': int(vals.size),
                        'maturity': maturity,
                        'scene': p['sceneName'],
                    })
        print(date, maturity, 'ok')

    with open(OUTPUT / 'nisar_timeseries.csv', 'w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} filas en {OUTPUT / "nisar_timeseries.csv"}')


if __name__ == '__main__':
    main()
