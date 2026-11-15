"""Chequeo: Buenas Prácticas Agrícolas provinciales."""

# Esqueleto: devuelve NO_DATA hasta que se implemente.

from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus

KEY = 'bpa'
TITLE = 'Buenas Prácticas Agrícolas provinciales'


def run(lot: Lot) -> CheckResult:
    return CheckResult(
        key=KEY,
        title=TITLE,
        status=CheckStatus.NO_DATA,
        summary='Chequeo todavía no disponible.',
        origin=CheckOrigin.DECLARED,
    )
