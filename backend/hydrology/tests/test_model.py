"""Pruebas del modelo lluvia-escorrentía: SCS-CN, ARC e hidrograma unitario."""

import math

import pytest

from hydrology.runoff import (
    CoverShare,
    adjust_arc,
    basin_excess,
    cumulative_excess,
    parameters,
    retention_mm,
    runoff_mm,
    volume_m3,
    weighted_cn,
)
from hydrology.unit_hydrograph import (
    lag_hours,
    peak_constant_si,
    resample,
    route,
    step_for,
    unit_ordinates,
)


def test_retention_follows_scs_equation():
    assert retention_mm(100) == 0
    assert retention_mm(75) == pytest.approx(25400 / 75 - 254)


def test_no_runoff_below_initial_abstraction():
    s = retention_mm(75)
    assert runoff_mm(0.2 * s, 75) == 0
    assert runoff_mm(0.2 * s - 1, 75) == 0
    assert runoff_mm(0, 75) == 0


def test_runoff_for_100_mm_and_cn_75():
    s = 25400 / 75 - 254
    expected = (100 - 0.2 * s) ** 2 / (100 + 0.8 * s)
    assert runoff_mm(100, 75) == pytest.approx(expected)
    assert runoff_mm(100, 75) == pytest.approx(41.14, abs=0.01)


def test_all_rain_runs_off_with_cn_100():
    assert runoff_mm(37, 100) == pytest.approx(37)


def test_volume_is_mm_times_hectares_times_ten():
    assert volume_m3(10, 50) == 5000


def test_runoff_grows_with_rain_and_cn():
    assert runoff_mm(60, 75) < runoff_mm(100, 75)
    assert runoff_mm(60, 70) < runoff_mm(60, 85)


def test_cumulative_excess_adds_up_to_total_runoff():
    steps = [5, 20, 30, 10, 0, 35]
    assert sum(cumulative_excess(steps, 80)) == pytest.approx(runoff_mm(sum(steps), 80))
    assert all(e >= 0 for e in cumulative_excess(steps, 80))


def test_arc_conversion_uses_neh_table_10_1():
    assert adjust_arc(75, 'I') == 57
    assert adjust_arc(75, 'III') == 88
    assert adjust_arc(75, 'II') == 75
    # entre 74 (55, 88) y 75 (57, 88)
    assert adjust_arc(74.5, 'I') == pytest.approx(56)
    with pytest.raises(ValueError):
        adjust_arc(75, 'IV')


def test_basin_excess_by_cover_differs_from_average_cn():
    covers = [CoverShare('a', 'a', 50, 60), CoverShare('b', 'b', 50, 90)]
    by_cover = sum(basin_excess([60], covers, 'II'))
    expected = (runoff_mm(60, 60) + runoff_mm(60, 90)) / 2
    assert by_cover == pytest.approx(expected)
    assert weighted_cn(covers) == 75
    assert by_cover != pytest.approx(runoff_mm(60, 75))


def test_curve_numbers_match_tr55_table_2_2b():
    cn = parameters()['curve_numbers']['covers']['row_crops_sr_cr_good']['cn']
    assert cn == {'A': 64, 'B': 75, 'C': 82, 'D': 85}


def test_peak_constant_in_si_units():
    # 484 en unidades inglesas equivale a ~0,208 m3/s por km2, mm y hora
    assert peak_constant_si(484) == pytest.approx(0.2083, abs=1e-4)


def test_unit_hydrograph_holds_one_mm_of_volume():
    area_km2, tp = 2.0, 3.0
    step = 0.2 * tp
    volume = sum(unit_ordinates(tp, step, area_km2, 484)) * step * 3600
    assert volume == pytest.approx(area_km2 * 1e6 * 1e-3, rel=0.03)


def test_lag_equation_neh_15_4a():
    length_m, cn, slope = 2000.0, 75.0, 0.5
    s_in = (1000 / cn) - 10
    expected = (length_m / 0.3048) ** 0.8 * (s_in + 1) ** 0.7 / (1900 * math.sqrt(slope))
    hours, notes = lag_hours(length_m, cn, slope)
    assert hours == pytest.approx(expected, rel=1e-3)
    assert notes == []


def test_lag_clamps_cn_out_of_range_and_says_so():
    _, notes = lag_hours(1000, 98, 0.3)
    assert notes and '95' in notes[0]


def test_step_is_at_most_a_fifth_of_tp():
    lag = 0.8
    step = step_for(lag, 0.5)
    assert step <= 0.2 * (step / 2 + lag) + 1e-9
    assert sum(resample([3, 6], 0.5, step)) == pytest.approx(9)


def test_route_peak_of_a_single_pulse():
    lag, step, area = 2.0, 0.25, 1.5
    hydro = route([10.0], step, area, lag)
    tp = step / 2 + lag
    assert hydro.peak_m3s == pytest.approx(10 * peak_constant_si(484) * area / tp, rel=0.02)
    assert hydro.time_to_peak_h == pytest.approx(tp, abs=step)
