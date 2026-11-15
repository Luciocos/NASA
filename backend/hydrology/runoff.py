"""Escorrentía directa por el método del Número de Curva (SCS-CN).

Ecuaciones (NEH 630 cap. 10, en mm):
    S = 25400 / CN - 254
    Ia = 0,2 S
    Q = (P - Ia)^2 / (P + 0,8 S) si P > Ia; si no, Q = 0
    V (m3) = Q (mm) x A (ha) x 10
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

PARAMETERS_FILE = Path(__file__).resolve().parent / 'parameters.yaml'
ARC_LEVELS = ('I', 'II', 'III')


@lru_cache(maxsize=1)
def parameters() -> dict:
    return yaml.safe_load(PARAMETERS_FILE.read_text())


def retention_mm(cn: float) -> float:
    """retención potencial máxima S en mm"""
    if not 0 < cn <= 100:
        raise ValueError('CN fuera de rango')
    return 25400 / cn - 254


def runoff_mm(rain_mm: float, cn: float) -> float:
    """escorrentía directa Q (mm) de una lluvia acumulada P (mm)"""
    if rain_mm <= 0:
        return 0.0
    s = retention_mm(cn)
    ia = 0.2 * s
    if rain_mm <= ia:
        return 0.0
    return (rain_mm - ia) ** 2 / (rain_mm + 0.8 * s)


def volume_m3(runoff: float, area_ha: float) -> float:
    return runoff * area_ha * 10


def cumulative_excess(rain_steps: list[float], cn: float) -> list[float]:
    """lluvia efectiva de cada paso: diferencia de Q sobre la lluvia acumulada"""
    out = []
    total = 0.0
    previous = 0.0
    for p in rain_steps:
        total += max(0.0, p)
        q = runoff_mm(total, cn)
        out.append(q - previous)
        previous = q
    return out


def adjust_arc(cn_ii: float, arc: str) -> float:
    """CN para la condición antecedente pedida, interpolando NEH 630 Tabla 10-1"""
    if arc == 'II':
        return cn_ii
    if arc not in ARC_LEVELS:
        raise ValueError('ARC debe ser I, II o III')
    table = {int(k): v for k, v in parameters()['antecedent_runoff_condition']['table'].items()}
    col = 0 if arc == 'I' else 1
    lo = max(k for k in table if k <= cn_ii) if cn_ii >= min(table) else min(table)
    hi = min(k for k in table if k >= cn_ii) if cn_ii <= max(table) else max(table)
    if lo == hi:
        return float(table[lo][col])
    t = (cn_ii - lo) / (hi - lo)
    return table[lo][col] + t * (table[hi][col] - table[lo][col])


@dataclass(frozen=True)
class CoverShare:
    """una cobertura de la cuenca con su CN en ARC II"""

    key: str
    label: str
    area_ha: float
    cn: float


def weighted_cn(covers: list[CoverShare]) -> float:
    area = sum(c.area_ha for c in covers)
    if area <= 0:
        raise ValueError('Cuenca sin superficie')
    return sum(c.cn * c.area_ha for c in covers) / area


def basin_excess(rain_steps: list[float], covers: list[CoverShare], arc: str) -> list[float]:
    """lluvia efectiva media de la cuenca: se calcula Q por cobertura y se pondera por área.

    Calcular por cobertura y sumar evita el sesgo de aplicar un CN promedio cuando los CN de
    las coberturas son muy distintos (NEH 630 cap. 10)."""
    area = sum(c.area_ha for c in covers)
    total = [0.0] * len(rain_steps)
    for c in covers:
        excess = cumulative_excess(rain_steps, adjust_arc(c.cn, arc))
        for i, e in enumerate(excess):
            total[i] += e * c.area_ha / area
    return total
