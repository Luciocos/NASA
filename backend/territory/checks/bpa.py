"""Chequeo: Buenas Prácticas Agrícolas provinciales.

No es un cruce espacial: muestra lo que el productor declaró sobre su adhesión al programa
provincial de BPA. No se contrasta contra ningún registro oficial (no se encontró uno público
y consultable), así que el origen es siempre DECLARED.
"""

from django.core.exceptions import ObjectDoesNotExist

from lots.models import Lot
from territory.result import CheckOrigin, CheckResult, CheckStatus, LayerSource

KEY = 'bpa'
TITLE = 'Buenas Prácticas Agrícolas provinciales'

# Programa de la provincia de Santa Fe, según la noticia oficial del gobierno provincial.
# No se pudo confirmar el número de la norma que lo crea ni su vigencia actual.
SOURCES = [
    LayerSource(
        name='Programa Buenas Prácticas Agropecuarias (Santa Fe)',
        publisher='Gobierno de la Provincia de Santa Fe',
        url='https://www.santafe.gov.ar/noticias/noticia/270244/',
    )
]


def run(lot: Lot) -> CheckResult:
    try:
        declaration = lot.bpa_declaration
    except ObjectDoesNotExist:
        return CheckResult(
            key=KEY,
            title=TITLE,
            status=CheckStatus.NO_DATA,
            summary='El productor no declaró adhesión a BPA.',
            origin=CheckOrigin.DECLARED,
            sources=list(SOURCES),
        )

    if declaration.adheres:
        number = declaration.registration_number
        status = CheckStatus.CLEAR
        summary = (
            'El productor declaró estar adherido al programa provincial de BPA'
            + (f' (inscripción {number}).' if number else '.')
            + ' Es un dato declarado: no se verificó contra el registro.'
        )
    else:
        status = CheckStatus.POSSIBLE_CONFLICT
        summary = (
            'El productor declaró no estar adherido al programa provincial de BPA. '
            'No implica un incumplimiento: es un punto para revisar.'
        )

    return CheckResult(
        key=KEY,
        title=TITLE,
        status=status,
        summary=summary,
        origin=CheckOrigin.DECLARED,
        sources=list(SOURCES),
        details={
            'adheres': declaration.adheres,
            'registration_number': declaration.registration_number,
            'program': declaration.program,
            'declared_at': declaration.declared_at.isoformat(),
        },
    )
