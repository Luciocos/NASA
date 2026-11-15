"""Chequeo: Bosque nativo (OTBN, Ley 26.331)."""

# Esqueleto: devuelve NO_DATA hasta que se implemente.

from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus

KEY = 'otbn'
TITLE = 'Bosque nativo (OTBN, Ley 26.331)'


def run(lot: Lot) -> CheckResult:
    return CheckResult(
        key=KEY,
        title=TITLE,
        status=CheckStatus.NO_DATA,
        summary='Chequeo todavía no disponible.',
        origin=CheckOrigin.OFFICIAL_LAYER,
    )
