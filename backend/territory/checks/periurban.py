"""Chequeo: Distancias de exclusión periurbanas."""

# Esqueleto: devuelve NO_DATA hasta que se implemente.

from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus

KEY = 'periurban'
TITLE = 'Distancias de exclusión periurbanas'


def run(lot: Lot) -> CheckResult:
    return CheckResult(
        key=KEY,
        title=TITLE,
        status=CheckStatus.NO_DATA,
        summary='Chequeo todavía no disponible.',
        origin=CheckOrigin.OFFICIAL_LAYER,
    )
