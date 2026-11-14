"""Pruebas de lectura de factors.yaml y score_config.yaml (los archivos reales)."""

from carbon.config import load_factors, load_weights
from carbon.footprint import COMPONENTS
from carbon.score import CRITERIA


def test_factors_yaml_tiene_todos_los_componentes() -> None:
    factors = load_factors()
    assert {c.factor_key for c in COMPONENTS} <= set(factors)


def test_ningun_factor_con_valor_sin_fuente_ni_validacion() -> None:
    """Regla de CLAUDE.md, sección 9: no se cargan valores sin fuente verificada."""
    for factor in load_factors().values():
        if factor.value is not None:
            assert factor.source, f'{factor.key}: tiene valor y no tiene fuente'
            assert factor.validated, f'{factor.key}: tiene valor y no está validado'
            assert factor.unit, f'{factor.key}: tiene valor y no tiene unidad'


def test_score_config_tiene_todos_los_criterios() -> None:
    assert set(load_weights()) == {key for key, _label in CRITERIA}
