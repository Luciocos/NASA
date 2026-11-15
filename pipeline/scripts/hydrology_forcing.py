"""Datos de lluvia, humedad, evapotranspiración, cobertura y suelo para la cuenca del Lote 3.

Corre después de hydrology_terrain.py (usa su grilla). Fuentes, todas con fecha de descarga en
forcing.json:

- GPM IMERG V07 (NASA): diaria (GPM_3IMERGDF Final y GPM_3IMERGDL Late para los meses que la
  Final todavía no cubre) y cada media hora (GPM_3IMERGHH / GPM_3IMERGHHL) para los días de
  lluvia fuerte. Celdas de 0,1 grados: un bloque de 3 x 3 que cubre la ventana de la cuenca.
- SMAP L3 9 km (SPL3SMP_E, NASA/NSIDC): humedad superficial del suelo antes de cada evento.
- MODIS MOD16A2GF / MOD16A2 (NASA, ORNL DAAC): evapotranspiración de 8 días en el lote.
- MODIS MCD12Q1 (NASA, ORNL DAAC): cobertura IGBP de 500 m sobre toda la ventana.
- SoilGrids 2.0 (ISRIC): textura 0-30 cm en una grilla de puntos de la ventana.

Requiere EARTHDATA_USERNAME y EARTHDATA_PASSWORD en el .env y la app "NASA GESDISC DATA ARCHIVE"
autorizada en la cuenta de Earthdata.

Uso: python scripts/hydrology_forcing.py
"""

import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import numpy as np
import requests
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from edl import get_token  # noqa: E402

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PIPELINE_DIR.parent
OUT_DIR = REPO_DIR / 'data' / 'hydrology' / 'lote3'
RAW_DIR = PIPELINE_DIR / 'output' / 'hydrology_raw'

START = date(2020, 1, 1)
CMR = 'https://cmr.earthdata.nasa.gov/search/granules.umm_json'
ORNL = 'https://modis.ornl.gov/rst/api/v1'
SOILGRIDS = 'https://rest.isric.org/soilgrids/v2.0/properties/query'

# días con al menos esta lluvia en la celda del lote se bajan cada media hora. Es un criterio de
# selección para no bajar decenas de miles de archivos, no un umbral de escorrentía
EVENT_DAY_MM = 20.0
# dos lluvias separadas por al menos estas horas secas son eventos distintos (convención usual
# para separar tormentas; ver forcing.json)
DRY_GAP_H = 6.0
WORKERS = 16

_token: str | None = None


def headers() -> dict:
    global _token
    if _token is None:
        _token = get_token()
    return {'Authorization': f'Bearer {_token}'}


def lot_center() -> tuple[float, float]:
    terrain = json.loads((OUT_DIR / 'terrain.json').read_text())
    west, south, east, north = terrain['grid']['bounds']
    return (south + north) / 2, (west + east) / 2


def imerg_block(bounds: list[float]) -> tuple[slice, slice, list[float], list[float]]:
    west, south, east, north = bounds
    i0, i1 = int(np.floor((west + 180) / 0.1)), int(np.floor((east + 180) / 0.1))
    j0, j1 = int(np.floor((south + 90) / 0.1)), int(np.floor((north + 90) / 0.1))
    lons = [round(-179.95 + 0.1 * i, 2) for i in range(i0, i1 + 1)]
    lats = [round(-89.95 + 0.1 * j, 2) for j in range(j0, j1 + 1)]
    return slice(i0, i1), slice(j0, j1), lons, lats


def cmr_opendap(short: str, start: str, end: str) -> list[tuple[str, str]]:
    """(inicio, url OPeNDAP) de cada gránulo de la colección en el intervalo"""
    out = []
    search_after = None
    while True:
        h = {'CMR-Search-After': search_after} if search_after else {}
        for attempt in range(6):
            try:
                r = requests.get(
                    CMR,
                    params={
                        'short_name': short,
                        'version': '07',
                        'temporal': f'{start},{end}',
                        'page_size': 2000,
                        'sort_key': 'start_date',
                    },
                    headers=h,
                    timeout=120,
                )
                r.raise_for_status()
                break
            except requests.RequestException:
                if attempt == 5:
                    raise
                time.sleep(5 * (attempt + 1))
        for it in r.json()['items']:
            urls = [u['URL'] for u in it['umm']['RelatedUrls'] if 'opendap.earthdata' in u['URL']]
            begin = it['umm']['TemporalExtent']['RangeDateTime']['BeginningDateTime']
            if urls:
                out.append((begin, urls[0]))
        search_after = r.headers.get('CMR-Search-After')
        if not search_after or not r.json()['items']:
            return out


def parse_dap_csv(text: str, var: str) -> list[list[float]]:
    """filas [lon][lat] de una variable en la salida .dap.csv de OPeNDAP"""
    rows = []
    for line in text.splitlines():
        if line.startswith(var + '['):
            rows.append([float(v) for v in line.split(',')[1:]])
    return rows


def fetch_dap(url: str, ce: str, var: str, retries: int = 4) -> list[list[float]]:
    for attempt in range(retries):
        try:
            r = requests.get(f'{url}.dap.csv?dap4.ce={ce}', headers=headers(), timeout=120)
            if r.status_code == 200:
                return parse_dap_csv(r.text, var)
        except requests.RequestException:
            pass
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'No se pudo leer {url}')


def daily_rain(block) -> dict:
    cache = RAW_DIR / 'imerg_daily.json'
    data = json.loads(cache.read_text()) if cache.exists() else {}
    isl, jsl, _, _ = block
    ce = f'/precipitation[0][{isl.start}:{isl.stop}][{jsl.start}:{jsl.stop}]'
    today = datetime.now(UTC).strftime('%Y-%m-%dT00:00:00Z')
    granules = [
        (b, u, 'Final') for b, u in cmr_opendap('GPM_3IMERGDF', f'{START}T00:00:00Z', today)
    ]
    last_final = max(b for b, _, _ in granules)[:10]
    granules += [
        (b, u, 'Late')
        for b, u in cmr_opendap('GPM_3IMERGDL', f'{last_final}T23:59:59Z', today)
        if b[:10] > last_final
    ]
    todo = [(b[:10], u, run) for b, u, run in granules if b[:10] not in data]
    print(f'IMERG diaria: {len(granules)} días, faltan {len(todo)}')

    def one(item):
        day, url, run = item
        return day, run, fetch_dap(url, ce, '/precipitation')

    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (day, run, grid) in enumerate(pool.map(one, todo), 1):
            data[day] = {'run': run, 'mm': grid}
            if n % 200 == 0:
                cache.write_text(json.dumps(data))
                print(f'  {n}/{len(todo)}')
    cache.write_text(json.dumps(data))
    return dict(sorted(data.items()))


def half_hourly(block, days: list[str], final_until: str) -> dict:
    cache = RAW_DIR / 'imerg_hh.json'
    data = json.loads(cache.read_text()) if cache.exists() else {}
    isl, jsl, _, _ = block
    ce = f'/Grid/precipitation[0][{isl.start}:{isl.stop}][{jsl.start}:{jsl.stop}]'
    per_day = Counter(k[:10] for k in data)
    pending = [d for d in days if per_day[d] < 48]
    # días consecutivos de la misma versión en una sola consulta a CMR
    ranges: list[list[str]] = []
    for day in pending:
        prev = ranges[-1][-1] if ranges else None
        same_run = prev is not None and (prev <= final_until) == (day <= final_until)
        if same_run and date.fromisoformat(day) - date.fromisoformat(prev) == timedelta(days=1):
            ranges[-1].append(day)
        else:
            ranges.append([day])
    granules = []
    for chunk in ranges:
        short = 'GPM_3IMERGHH' if chunk[0] <= final_until else 'GPM_3IMERGHHL'
        for b, u in cmr_opendap(short, f'{chunk[0]}T00:00:00Z', f'{chunk[-1]}T23:59:59Z'):
            if b[:16] not in data and b[:10] in chunk:
                granules.append((b[:16], u, 'Final' if short == 'GPM_3IMERGHH' else 'Late'))
    print(f'IMERG media hora: faltan {len(granules)} archivos')

    def one(item):
        stamp, url, run = item
        return stamp, run, fetch_dap(url, ce, '/Grid/precipitation')

    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (stamp, run, grid) in enumerate(pool.map(one, granules), 1):
            data[stamp] = {'run': run, 'mm_h': grid}
            if n % 300 == 0:
                cache.write_text(json.dumps(data))
                print(f'  {n}/{len(granules)}')
    cache.write_text(json.dumps(data))
    return dict(sorted(data.items()))


def split_events(hh: dict, ci: int, cj: int) -> list[dict]:
    """eventos de la serie de media hora en la celda del lote, separados por DRY_GAP_H secas"""
    stamps = sorted(hh)
    events = []
    current: list[str] = []
    dry = 0.0
    last_time = None
    for s in stamps:
        t = datetime.fromisoformat(s + ':00+00:00')
        if last_time is not None and (t - last_time) > timedelta(minutes=30):
            # hueco en la serie (días no bajados): cierra el evento
            if current:
                events.append(current)
            current, dry = [], 0.0
        last_time = t
        rate = hh[s]['mm_h'][ci][cj]
        if rate > 0:
            current.append(s)
            dry = 0.0
        elif current:
            dry += 0.5
            if dry >= DRY_GAP_H:
                events.append(current)
                current, dry = [], 0.0
    if current:
        events.append(current)
    out = []
    for ev in events:
        t0 = datetime.fromisoformat(ev[0] + ':00+00:00')
        t1 = datetime.fromisoformat(ev[-1] + ':00+00:00') + timedelta(minutes=30)
        steps = []
        t = t0
        while t < t1:
            key = t.strftime('%Y-%m-%dT%H:%M')
            grid = hh[key]['mm_h'] if key in hh else None
            steps.append([[round(v * 0.5, 3) for v in row] for row in grid] if grid else None)
            t += timedelta(minutes=30)
        total_lot = sum(s[ci][cj] for s in steps if s)
        if total_lot < EVENT_DAY_MM:
            continue
        out.append(
            {
                'start': t0.isoformat().replace('+00:00', 'Z'),
                'end': t1.isoformat().replace('+00:00', 'Z'),
                'run': hh[ev[0]]['run'],
                'step_h': 0.5,
                # mm caídos en cada media hora, por celda [lon][lat]
                'mm': steps,
            }
        )
    return out


def smap_before(day: str, lat: float, lon: float) -> dict | None:
    """humedad SMAP 9 km de la mañana, del día anterior al evento o hasta 3 días antes"""
    to_ease = Transformer.from_crs('EPSG:4326', 'EPSG:6933', always_xy=True)
    x, y = to_ease.transform(lon, lat)
    cell = 9008.055210146
    col = int((x + 17367530.44516138) // cell)
    row = int((7314540.830638 - y) // cell)
    d0 = date.fromisoformat(day)
    for back in range(1, 4):
        d = d0 - timedelta(days=back)
        r = requests.get(
            CMR,
            params={
                'short_name': 'SPL3SMP_E',
                'temporal': f'{d}T00:00:00Z,{d}T23:59:59Z',
                'page_size': 5,
            },
            timeout=60,
        )
        items = r.json().get('items', [])
        urls = [
            u['URL']
            for it in items
            for u in it['umm']['RelatedUrls']
            if 'opendap.earthdata' in u['URL']
        ]
        if not urls:
            continue
        g = '/Soil_Moisture_Retrieval_Data_AM'
        cell_ix = f'[{row}][{col}]'
        ce = f'{g}/soil_moisture{cell_ix};{g}/latitude{cell_ix};{g}/longitude{cell_ix}'
        try:
            rr = requests.get(f'{urls[-1]}.dap.csv?dap4.ce={ce}', headers=headers(), timeout=120)
        except requests.RequestException:
            continue
        values = {}
        for line in rr.text.splitlines():
            for var in ('soil_moisture', 'latitude', 'longitude'):
                if line.startswith(f'{g}/{var}'):
                    values[var] = float(line.split(',')[-1])
        sm = values.get('soil_moisture')
        if sm is None or sm < 0:
            continue
        return {
            'date': d.isoformat(),
            'm3_m3': round(sm, 3),
            'cell_center': [round(values['latitude'], 3), round(values['longitude'], 3)],
            'product': 'SPL3SMP_E (AM)',
        }
    return None


def ornl_series(product: str, band: str, lat: float, lon: float, start: date, end: date):
    r = requests.get(
        f'{ORNL}/{product}/dates', params={'latitude': lat, 'longitude': lon}, timeout=60
    )
    r.raise_for_status()
    dates = [
        d['modis_date']
        for d in r.json()['dates']
        if start.isoformat() <= d['calendar_date'] <= end.isoformat()
    ]
    out = []
    for k in range(0, len(dates), 10):
        chunk = dates[k : k + 10]
        r = requests.get(
            f'{ORNL}/{product}/subset',
            params={
                'latitude': lat,
                'longitude': lon,
                'band': band,
                'startDate': chunk[0],
                'endDate': chunk[-1],
                'kmAboveBelow': 0,
                'kmLeftRight': 0,
            },
            headers={'Accept': 'application/json'},
            timeout=120,
        )
        r.raise_for_status()
        for s in r.json()['subset']:
            out.append((s['calendar_date'], s['data'][0]))
    return out


def evapotranspiration(lat: float, lon: float) -> dict:
    cache = RAW_DIR / 'mod16.json'
    if cache.exists():
        return json.loads(cache.read_text())
    series = []
    for product, start, end in (
        ('MOD16A2GF', START, date(2025, 12, 31)),
        ('MOD16A2', date(2026, 1, 1), date.today()),
    ):
        try:
            for day, raw in ornl_series(product, 'ET_500m', lat, lon, start, end):
                if day in {d for d, _, _ in series}:
                    continue
                value = None if raw > 32700 or raw < 0 else round(raw * 0.1, 1)
                series.append((day, value, product))
        except requests.HTTPError as e:
            print('MOD16', product, 'no disponible:', e)
    result = {
        'product': 'MOD16A2GF (hasta 2025) y MOD16A2 (2026), píxel de 500 m en el centro del lote',
        'unit': 'mm en 8 días',
        'series': [{'start': d, 'et_mm': v, 'product': p} for d, v, p in sorted(series)],
    }
    cache.write_text(json.dumps(result))
    return result


def land_cover(lat: float, lon: float) -> None:
    """MCD12Q1 IGBP del último año, remuestreado por vecino más cercano a la grilla del DEM"""
    terrain = np.load(OUT_DIR / 'terrain.npz')
    t = terrain['transform']
    rows, cols = terrain['code'].shape
    r = requests.get(
        f'{ORNL}/MCD12Q1/dates', params={'latitude': lat, 'longitude': lon}, timeout=60
    )
    last = r.json()['dates'][-1]
    r = requests.get(
        f'{ORNL}/MCD12Q1/subset',
        params={
            'latitude': lat,
            'longitude': lon,
            'band': 'LC_Type1',
            'startDate': last['modis_date'],
            'endDate': last['modis_date'],
            'kmAboveBelow': 12,
            'kmLeftRight': 12,
        },
        headers={'Accept': 'application/json'},
        timeout=180,
    )
    r.raise_for_status()
    sub = r.json()
    grid = np.array(sub['subset'][0]['data'], dtype=np.uint8).reshape(sub['nrows'], sub['ncols'])
    cell = float(sub['cellsize'])
    x0, y0 = float(sub['xllcorner']), float(sub['yllcorner'])
    sinu = '+proj=sinu +R=6371007.181 +nadgrids=@null +wktext'
    to_sinu = Transformer.from_crs('EPSG:4326', sinu, always_xy=True)
    cc, rr = np.meshgrid(np.arange(cols) + 0.5, np.arange(rows) + 0.5)
    lons = t[2] + t[0] * cc
    lats = t[5] + t[4] * rr
    x, y = to_sinu.transform(lons, lats)
    ci = np.clip(((x - x0) // cell).astype(int), 0, sub['ncols'] - 1)
    ri = np.clip((sub['nrows'] - 1 - (y - y0) // cell).astype(int), 0, sub['nrows'] - 1)
    lc = grid[ri, ci]
    np.savez_compressed(OUT_DIR / 'landcover.npz', igbp=lc)
    return {'product': 'MCD12Q1 LC_Type1 (IGBP)', 'year': last['calendar_date'][:4], 'pixel_m': 500}


def texture_class(sand: float, silt: float, clay: float) -> str:
    """clase textural USDA a partir de los porcentajes (triángulo textural)"""
    if silt + 1.5 * clay < 15:
        return 'sand'
    if silt + 1.5 * clay >= 15 and silt + 2 * clay < 30:
        return 'loamy sand'
    if (7 <= clay < 20 and sand > 52 and silt + 2 * clay >= 30) or (
        clay < 7 and silt < 50 and silt + 2 * clay >= 30
    ):
        return 'sandy loam'
    if 7 <= clay < 27 and 28 <= silt < 50 and sand <= 52:
        return 'loam'
    if (silt >= 50 and 12 <= clay < 27) or (50 <= silt < 80 and clay < 12):
        return 'silt loam'
    if silt >= 80 and clay < 12:
        return 'silt'
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return 'sandy clay loam'
    if 27 <= clay < 40 and 20 < sand <= 45:
        return 'clay loam'
    if 27 <= clay < 40 and sand <= 20:
        return 'silty clay loam'
    if clay >= 35 and sand > 45:
        return 'sandy clay'
    if clay >= 40 and silt >= 40:
        return 'silty clay'
    return 'clay'


def soils() -> dict:
    cache = RAW_DIR / 'soilgrids.json'
    points = json.loads(cache.read_text()) if cache.exists() else []
    terrain = json.loads((OUT_DIR / 'terrain.json').read_text())
    west, south, east, north = terrain['grid']['bounds']
    done = {(p['lat'], p['lon']) for p in points}
    for fy in (0.2, 0.5, 0.8):
        for fx in (0.2, 0.5, 0.8):
            lat = round(south + fy * (north - south), 4)
            lon = round(west + fx * (east - west), 4)
            if (lat, lon) in done:
                continue
            r = requests.get(
                SOILGRIDS,
                params=[('lon', lon), ('lat', lat), ('value', 'mean')]
                + [('property', p) for p in ('sand', 'silt', 'clay')]
                + [('depth', d) for d in ('0-5cm', '5-15cm', '15-30cm')],
                timeout=120,
            )
            if r.status_code != 200:
                print('SoilGrids', r.status_code, lat, lon)
                time.sleep(15)
                continue
            frac = {}
            for layer in r.json()['properties']['layers']:
                vals = {d['label']: d['values']['mean'] for d in layer['depths']}
                if None in vals.values():
                    break
                # promedio 0-30 cm ponderado por espesor; g/kg a %
                frac[layer['name']] = (
                    (vals['0-5cm'] * 5 + vals['5-15cm'] * 10 + vals['15-30cm'] * 15) / 30 / 10
                )
            if len(frac) == 3:
                points.append({'lat': lat, 'lon': lon, **{k: round(v, 1) for k, v in frac.items()}})
            cache.write_text(json.dumps(points))
            time.sleep(13)  # SoilGrids admite 5 consultas por minuto
    for p in points:
        p['texture'] = texture_class(p['sand'], p['silt'], p['clay'])
    return {
        'product': 'SoilGrids 2.0 (ISRIC), media 0-30 cm ponderada por espesor, 250 m',
        'points': points,
    }


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    terrain = json.loads((OUT_DIR / 'terrain.json').read_text())
    bounds = terrain['grid']['bounds']
    lat, lon = lot_center()
    block = imerg_block(bounds)
    _, _, lons, lats = block
    ci = int(np.argmin([abs(x - lon) for x in lons]))
    cj = int(np.argmin([abs(y - lat) for y in lats]))

    daily = daily_rain(block)
    final_until = max(d for d, v in daily.items() if v['run'] == 'Final')
    heavy = [d for d, v in daily.items() if v['mm'][ci][cj] >= EVENT_DAY_MM]
    days = sorted(
        {(date.fromisoformat(d) + timedelta(days=k)).isoformat() for d in heavy for k in (-1, 0, 1)}
    )
    days = [d for d in days if d in daily]
    print(f'{len(heavy)} días con al menos {EVENT_DAY_MM} mm; bajando {len(days)} días cada 30 min')
    hh = half_hourly(block, days, final_until)
    events = split_events(hh, ci, cj)
    print(f'{len(events)} eventos')

    smap_cache = RAW_DIR / 'smap.json'
    smap = json.loads(smap_cache.read_text()) if smap_cache.exists() else {}
    for ev in events:
        day = ev['start'][:10]
        if day not in smap:
            smap[day] = smap_before(day, lat, lon)
            smap_cache.write_text(json.dumps(smap))
        ev['smap'] = smap[day]

    et = evapotranspiration(lat, lon)
    lc = land_cover(lat, lon)
    soil = soils()

    forcing = {
        'generated_at': datetime.now(UTC).isoformat(timespec='seconds'),
        'imerg': {
            'cells': {'lon': lons, 'lat': lats, 'lot_cell': [ci, cj], 'size_deg': 0.1},
            'daily_product': 'GPM_3IMERGDF V07 (Final) y GPM_3IMERGDL V07 (Late)',
            'half_hourly_product': 'GPM_3IMERGHH V07 (Final) y GPM_3IMERGHHL V07 (Late)',
            'final_until': final_until,
            'event_day_mm': EVENT_DAY_MM,
            'dry_gap_h': DRY_GAP_H,
            'daily': [
                {'date': d, 'run': v['run'], 'mm': [[round(x, 2) for x in r] for r in v['mm']]}
                for d, v in daily.items()
            ],
        },
        'events': events,
        'et': et,
        'land_cover': lc,
        'soil': soil,
    }
    (OUT_DIR / 'forcing.json').write_text(json.dumps(forcing, ensure_ascii=False))
    print('listo: forcing.json')


if __name__ == '__main__':
    main()
