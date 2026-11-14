"""Busca productos NISAR GCOV sobre un área. No requiere credenciales.

Uso: python scripts/search_nisar.py [--wkt POLYGON(...)] [--start AAAA-MM-DD]
"""

import argparse
from collections import Counter

import asf_search as asf

# Rectángulo de búsqueda alrededor de Casilda (Santa Fe), Zona Núcleo.
DEFAULT_WKT = 'POLYGON((-61.40 -33.20, -60.95 -33.20, -60.95 -32.90, -61.40 -32.90, -61.40 -33.20))'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--wkt', default=DEFAULT_WKT)
    parser.add_argument('--start', default='2025-07-30')
    parser.add_argument('--level', default='GCOV')
    args = parser.parse_args()

    results = asf.search(
        dataset='NISAR',
        processingLevel=args.level,
        intersectsWith=args.wkt,
        start=args.start,
    )
    print(f'{len(results)} productos {args.level}')
    rows = []
    for r in results:
        p = r.properties
        rows.append(p)
    groups = Counter(
        (p['collectionName'], p['flightDirection'], p['pathNumber'], p['frameNumber']) for p in rows
    )
    print('Por colección, dirección, path y frame:')
    for key, n in sorted(groups.items()):
        print(' ', *key, f'{n} escenas')
    for p in sorted(rows, key=lambda p: (p['pathNumber'], p['frameNumber'], p['startTime'])):
        h5 = p['bytes'].get(p['fileName'], {}).get('bytes', 0)
        print(
            p['startTime'][:10],
            p['collectionName'].replace('NISAR_L2_GCOV_', ''),
            p['flightDirection'][:4],
            f'path {p["pathNumber"]} frame {p["frameNumber"]}',
            '/'.join(p.get('mainBandPolarization') or []),
            ','.join(p.get('rangeBandwidth') or []),
            p.get('frameCoverage'),
            f'{h5 / 1e9:.2f} GB',
        )


if __name__ == '__main__':
    main()
