"""Extrae NDVI y recortes ópticos HLS (NASA) de cada lote.

Lee solo la ventana de cada lote en los COG remotos de LP DAAC, con token de Earthdata.
Usa la banda Fmask para descartar nubes, sombras y nieve.
Salida en pipeline/output/ (ignorada por git):
- hls_chips/<lote>_<fecha>.npz: rojo, verde, azul, NIR y máscara de nubes.
- hls_timeseries.csv: NDVI medio y fracción despejada por lote y fecha.

Uso: python scripts/extract_hls.py [--start 2026-06-01] [--end 2026-11-13]
"""

import argparse
import csv
import json
import os
from pathlib import Path

import edl
import numpy as np
import rasterio
import requests
import shapely
from pyproj import Transformer
from pystac_client import Client
from rasterio import features
from rasterio.windows import from_bounds
from shapely.geometry import shape

PIPELINE_DIR = Path(__file__).resolve().parents[1]
OUTPUT = PIPELINE_DIR / 'output'
CHIPS = OUTPUT / 'hls_chips'
STAC = 'https://cmr.earthdata.nasa.gov/stac/LPCLOUD'
MARGIN_M = 1000
# Bandas por producto: HLS S30 (Sentinel-2) y L30 (Landsat) usan códigos distintos
BANDS = {
    'HLSS30_2.0': {'blue': 'B02', 'green': 'B03', 'red': 'B04', 'nir': 'B8A'},
    'HLSL30_2.0': {'blue': 'B02', 'green': 'B03', 'red': 'B04', 'nir': 'B05'},
}
# Bits de Fmask: 1 nube, 2 adyacente a nube, 3 sombra de nube, 4 nieve/hielo
FMASK_BAD = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)
SCALE = 0.0001


def signed_url(url: str, token: str) -> str:
    """Resuelve la redirección autenticada de LP DAAC a un enlace firmado temporal.

    GDAL reenvía el encabezado Authorization a CloudFront y falla; el enlace firmado no lo necesita.
    """
    r = requests.get(
        url,
        headers={'Authorization': f'Bearer {token}'},
        allow_redirects=False,
        timeout=60,
    )
    if r.status_code in (301, 302, 303, 307, 308):
        return r.headers['Location']
    r.raise_for_status()
    return url


def read_lots() -> list[dict]:
    return json.loads((PIPELINE_DIR / 'lots.geojson').read_text())['features']


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', default='2026-06-01')
    parser.add_argument('--end', default='2026-11-13')
    parser.add_argument('--max-cloud', type=float, default=80)
    args = parser.parse_args()

    CHIPS.mkdir(parents=True, exist_ok=True)
    lots = read_lots()
    bbox = shapely.union_all([shape(f['geometry']) for f in lots]).bounds
    items = Client.open(STAC).search(
        collections=list(BANDS),
        bbox=bbox,
        datetime=f'{args.start}/{args.end}',
        max_items=500,
    )
    items = sorted(
        (i for i in items.items() if (i.properties.get('eo:cloud_cover') or 0) <= args.max_cloud),
        key=lambda i: i.datetime,
    )
    print(f'{len(items)} escenas HLS con hasta {args.max_cloud}% de nubes', flush=True)

    token = edl.get_token()
    os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
    os.environ.setdefault('GDAL_HTTP_MAX_RETRY', '4')
    os.environ.setdefault('GDAL_HTTP_RETRY_DELAY', '2')

    rows = []
    for item in items:
        date = item.datetime.date().isoformat()
        product = 'S30' if item.collection_id.startswith('HLSS30') else 'L30'
        key = f'{date}_{product}'
        try:
            codes = BANDS[item.collection_id]
            hrefs = {
                code: signed_url(item.assets[code].href, token)
                for code in [*codes.values(), 'Fmask']
            }
            with rasterio.open(hrefs['Fmask']) as src:
                crs = src.crs
            to_utm = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
            for f in lots:
                lot_id = f['properties']['id']
                poly = shapely.transform(
                    shape(f['geometry']),
                    lambda xy, t=to_utm: np.column_stack(t.transform(xy[:, 0], xy[:, 1])),
                )
                bounds = poly.buffer(MARGIN_M).bounds
                data = {}
                for name, code in {**codes, 'fmask': 'Fmask'}.items():
                    with rasterio.open(hrefs[code]) as src:
                        window = from_bounds(*bounds, transform=src.transform).round_offsets()
                        data[name] = src.read(1, window=window)
                        transform = src.window_transform(window)
                inside = features.geometry_mask([poly], data['red'].shape, transform, invert=True)
                clear = (data['fmask'] & FMASK_BAD) == 0
                np.savez_compressed(
                    CHIPS / f'{lot_id}_{key}.npz',
                    **data,
                    inside=inside,
                    transform=np.array(transform)[:6],
                    epsg=crs.to_epsg(),
                )
                red = data['red'].astype(float) * SCALE
                nir = data['nir'].astype(float) * SCALE
                ok = inside & clear & (red > 0) & (nir > 0)
                clear_frac = ok.sum() / max(inside.sum(), 1)
                ndvi = (nir[ok] - red[ok]) / (nir[ok] + red[ok]) if ok.any() else np.array([])
                rows.append(
                    {
                        'lot': lot_id,
                        'date': date,
                        'product': product,
                        'ndvi': round(float(ndvi.mean()), 3) if ndvi.size else '',
                        'ndvi_std': round(float(ndvi.std()), 3) if ndvi.size else '',
                        'clear_fraction': round(float(clear_frac), 3),
                        'scene': item.id,
                    }
                )
            print(key, 'ok', flush=True)
        except Exception as exc:  # noqa: BLE001 - errores de red de varios tipos
            print(key, f'SE OMITE: {type(exc).__name__}', flush=True)

    with open(OUTPUT / 'hls_timeseries.csv', 'w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} filas en {OUTPUT / "hls_timeseries.csv"}', flush=True)


if __name__ == '__main__':
    main()
