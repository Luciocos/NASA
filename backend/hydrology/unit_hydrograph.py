"""Transformación lluvia-caudal con el hidrograma unitario adimensional del SCS.

- Retardo de la cuenca (NEH 630 cap. 15, ec. 15-4a): L = l^0,8 (S + 1)^0,7 / (1900 Y^0,5),
  con l en pies, S en pulgadas (con el CN de la cuenca) e Y la pendiente media en %.
- Tiempo al pico: Tp = dt / 2 + L (NEH 630 cap. 16, ec. 16A-7).
- Caudal pico del hidrograma unitario: qp = 484 A Q / Tp en pies3/s, con A en mi2 y Q en
  pulgadas (ec. 16A-6). En unidades SI la constante resulta de convertir esas unidades.
- Forma: Tabla 16-1. El intervalo de cálculo es 0,2 Tp o menos (NEH 630 cap. 16).
"""

from dataclasses import dataclass, field

from hydrology.runoff import parameters, retention_mm

FT_PER_M = 1 / 0.3048
MM_PER_IN = 25.4
KM2_PER_MI2 = 2.589988110336
M3S_PER_CFS = 0.028316846592


def peak_constant_si(prf: float) -> float:
    """constante del caudal pico en m3/s por (km2 x mm / h)"""
    return prf * M3S_PER_CFS / (KM2_PER_MI2 * MM_PER_IN)


def lag_hours(length_m: float, cn: float, slope_pct: float) -> tuple[float, list[str]]:
    """retardo en horas y avisos si se sale del rango de la ecuación"""
    lag = parameters()['lag']
    notes = []
    cn_used = min(max(cn, lag['cn_min']), lag['cn_max'])
    if cn_used != cn:
        notes.append(
            f'El CN de la cuenca ({cn:.0f}) está fuera del rango 50-95 de la ecuación de '
            f'retardo: se usó {cn_used:.0f}.'
        )
    if slope_pct <= 0:
        raise ValueError('Pendiente media nula: no se puede estimar el retardo')
    s_in = retention_mm(cn_used) / MM_PER_IN
    hours = (length_m * FT_PER_M) ** 0.8 * (s_in + 1) ** 0.7 / (1900 * slope_pct**0.5)
    return hours, notes


@dataclass
class Hydrograph:
    step_h: float
    times_h: list[float]
    flow_m3s: list[float]
    peak_m3s: float
    time_to_peak_h: float
    lag_h: float
    tp_h: float
    notes: list[str] = field(default_factory=list)


def unit_ordinates(tp_h: float, step_h: float, area_km2: float, prf: float) -> list[float]:
    """caudal (m3/s) del hidrograma unitario de 1 mm en cada paso"""
    ratios = parameters()['unit_hydrograph']['ratios']
    qp = peak_constant_si(prf) * area_km2 / tp_h
    out = []
    t = 0.0
    end = ratios[-1][0] * tp_h
    while t <= end + 1e-9:
        x = t / tp_h
        for (x0, y0), (x1, y1) in zip(ratios, ratios[1:], strict=False):
            if x0 <= x <= x1:
                y = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                break
        else:
            y = 0.0
        out.append(qp * y)
        t += step_h
    return out


def step_for(lag_h: float, base_step_h: float) -> float:
    """intervalo de cálculo: el de la lluvia, subdividido hasta quedar en 0,2 Tp o menos"""
    ratio = parameters()['unit_hydrograph']['max_step_ratio']
    step = base_step_h
    # Tp = step/2 + L; se divide el paso hasta cumplir step <= ratio * Tp
    while step > ratio * (step / 2 + lag_h) and step > 1 / 60:
        step /= 2
    return step


def resample(rain_steps: list[float], base_step_h: float, step_h: float) -> list[float]:
    """reparte la lluvia de cada paso en partes iguales cuando se achica el intervalo"""
    parts = round(base_step_h / step_h)
    return [p / parts for p in rain_steps for _ in range(parts)]


def route(
    excess_mm: list[float],
    step_h: float,
    area_km2: float,
    lag_h: float,
    notes: list[str] | None = None,
) -> Hydrograph:
    prf = parameters()['unit_hydrograph']['peak_rate_factor']
    tp = step_h / 2 + lag_h
    uh = unit_ordinates(tp, step_h, area_km2, prf)
    n = len(excess_mm) + len(uh) - 1
    flow = [0.0] * n
    for i, e in enumerate(excess_mm):
        if e <= 0:
            continue
        for j, u in enumerate(uh):
            flow[i + j] += e * u
    peak = max(flow) if flow else 0.0
    k = flow.index(peak) if flow else 0
    return Hydrograph(
        step_h=step_h,
        times_h=[round(i * step_h, 4) for i in range(n)],
        flow_m3s=flow,
        peak_m3s=peak,
        time_to_peak_h=k * step_h,
        lag_h=lag_h,
        tp_h=tp,
        notes=list(notes or []),
    )
