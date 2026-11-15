"""Registro de chequeos territoriales. Cada chequeo vive en su propio módulo.

Firma: def run(lot: Lot) -> CheckResult. Nunca debe lanzar por falta de datos: devuelve
CheckStatus.NO_DATA con un summary que explique qué falta.
"""

from collections.abc import Callable

from lots.models import Lot
from territory.checks import bpa, otbn, periurban
from territory.result import CheckResult

CHECKS: list[Callable[[Lot], CheckResult]] = [periurban.run, otbn.run, bpa.run]


def run_all(lot: Lot) -> list[CheckResult]:
    return [check(lot) for check in CHECKS]
