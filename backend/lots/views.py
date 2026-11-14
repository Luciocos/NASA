"""Vistas de lotes. Ver CLAUDE.md, sección 10."""

from django.db.models import Count, QuerySet
from rest_framework import generics
from rest_framework.serializers import BaseSerializer

from lots.models import Lot
from lots.serializers import LotDetailSerializer, LotSerializer


def _lots_with_counts() -> QuerySet[Lot]:
    return Lot.objects.annotate(event_count=Count('events'))


class LotListCreate(generics.ListCreateAPIView):
    """GET /api/lots/: lista de lotes con geometría y área.

    POST /api/lots/: alta de un lote a partir de un GeoJSON Polygon (EPSG:4326).
    Un lote nuevo no tiene eventos: la bitácora queda vacía hasta que se importen
    observaciones con import_events. No se generan eventos automáticamente.
    """

    queryset = _lots_with_counts()
    serializer_class = LotSerializer
    pagination_class = None

    def get_serializer_class(self) -> type[BaseSerializer]:
        return LotDetailSerializer if self.request.method == 'POST' else LotSerializer


class LotDetail(generics.RetrieveAPIView):
    """GET /api/lots/{id}/: ficha del lote con sus campañas."""

    queryset = _lots_with_counts().prefetch_related('campaigns')
    serializer_class = LotDetailSerializer
