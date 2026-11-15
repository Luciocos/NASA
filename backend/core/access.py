"""Quién ve y quién edita cada lote. Ver CLAUDE.md, sección 10.

Es el único lugar con estas reglas: lo usan las vistas de lots, events, carbon y passports.

- Ver (ficha, bitácora, huella, puntaje y simulador, que no guarda nada): el dueño, o
  cualquiera si es un ejemplo público.
- Editar (corregir eventos, declarar, generar el pasaporte): solo el dueño. Un ejemplo público
  responde 403. Un lote ajeno responde 404, igual que uno que no existe, para no revelarlo.
  La excepción es el pasaporte de un ejemplo: cualquiera lo comparte, y es siempre el mismo
  (passports/views.py).
"""

from django.contrib.auth.models import AnonymousUser, User
from django.db.models import Q, QuerySet
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.request import Request

from lots.models import Lot

EXAMPLE_READ_ONLY = 'Los lotes de ejemplo son de solo lectura.'


def not_found() -> NotFound:
    """El mismo 404 para lo ajeno y lo inexistente: la respuesta no dice si el lote existe."""
    return NotFound()


def is_owner(user: User | AnonymousUser, lot: Lot) -> bool:
    return user.is_authenticated and lot.owner_id == user.pk


def _visible_to(user: User | AnonymousUser) -> Q:
    if user.is_authenticated:
        return Q(public_example=True) | Q(owner=user)
    return Q(public_example=True)


def get_visible_lot(request: Request, lot_id: int, queryset: QuerySet[Lot] | None = None) -> Lot:
    """Lote propio o ejemplo público. Si no, 404."""
    lots = Lot.objects.all() if queryset is None else queryset
    lot = lots.filter(_visible_to(request.user), pk=lot_id).first()
    if lot is None:
        raise not_found()
    return lot


def check_owner(request: Request, lot: Lot) -> None:
    """Para editar un lote ya encontrado (por ejemplo, el de un evento): 403 o 404 si no es suyo."""
    if lot.public_example:
        raise PermissionDenied(EXAMPLE_READ_ONLY)
    if not is_owner(request.user, lot):
        raise not_found()


def get_owned_lot(request: Request, lot_id: int, queryset: QuerySet[Lot] | None = None) -> Lot:
    """Lote que el usuario puede editar. Ejemplo público: 403. Ajeno o inexistente: 404."""
    lots = Lot.objects.all() if queryset is None else queryset
    lot = lots.filter(pk=lot_id).first()
    if lot is None:
        raise not_found()
    check_owner(request, lot)
    return lot
