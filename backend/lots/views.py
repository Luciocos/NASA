"""Vistas de lotes. Ver CLAUDE.md, sección 10. Los permisos por lote viven en core/access.py."""

from django.db.models import Count, QuerySet
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.serializers import BaseSerializer

from core.access import get_visible_lot
from lots.models import Lot
from lots.serializers import LotDetailSerializer, LotSerializer


def _lots_with_counts() -> QuerySet[Lot]:
    return Lot.objects.annotate(event_count=Count('events'))


class LotListCreate(generics.ListCreateAPIView):
    """GET /api/lots/: los lotes del usuario, con geometría y área. Exige token.

    POST /api/lots/: alta de un lote a partir de un GeoJSON Polygon (EPSG:4326), con el
    usuario como dueño. Un lote nuevo no tiene eventos: la bitácora queda vacía hasta que se
    importen observaciones con import_events. No se generan eventos automáticamente.
    """

    serializer_class = LotSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Lot]:
        return _lots_with_counts().filter(owner=self.request.user)

    def get_serializer_class(self) -> type[BaseSerializer]:
        return LotDetailSerializer if self.request.method == 'POST' else LotSerializer

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(owner=self.request.user)


class ExampleLotList(generics.ListAPIView):
    """GET /api/examples/: lotes de ejemplo del pipeline, públicos y de solo lectura."""

    permission_classes = [AllowAny]
    queryset = _lots_with_counts().filter(public_example=True)
    serializer_class = LotSerializer
    pagination_class = None


class LotDetail(generics.RetrieveAPIView):
    """GET /api/lots/{id}/: ficha del lote con sus campañas (dueño o ejemplo público)."""

    permission_classes = [AllowAny]
    queryset = _lots_with_counts().prefetch_related('campaigns')
    serializer_class = LotDetailSerializer

    def get_object(self) -> Lot:
        return get_visible_lot(self.request, self.kwargs['pk'], self.get_queryset())
