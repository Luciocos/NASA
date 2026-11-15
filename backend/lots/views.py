"""Vistas de lotes. Ver CLAUDE.md, sección 10. Los permisos por lote viven en core/access.py."""

from django.db.models import Count, QuerySet
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ParseError, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from core.access import get_owned_lot, get_visible_lot
from lots.models import Lot
from lots.serializers import (
    BODY_NOT_OBJECT,
    LandUseDeclarationSerializer,
    LotDetailSerializer,
    LotSerializer,
    land_use_declaration,
)


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


class LotLandUse(APIView):
    """POST /api/lots/{id}/land-use/ con {"unchanged": true|false}.

    El productor declara si el lote cambió de uso del suelo desde 2020: true, que no cambió;
    false, que sí. Se guarda en el lote como dato DECLARED con la fecha, y declarar otra vez pisa
    lo anterior. Responde {"unchanged", "declared_at", "origin": "DECLARED"}, lo mismo que la
    ficha muestra en land_use_declaration. No genera eventos ni cambia el puntaje.

    Solo el dueño (core/access.py): sin token 401, un ejemplo público 403 y un lote ajeno o
    inexistente, 404. Cuerpo inválido: 400 con el error por campo.
    """

    def post(self, request: Request, lot_id: int) -> Response:
        lot = get_owned_lot(request, lot_id)
        try:
            data = request.data
        except ParseError as error:
            # A un JSON roto DRF responde con el texto del parser, en inglés
            raise ValidationError(
                {api_settings.NON_FIELD_ERRORS_KEY: [BODY_NOT_OBJECT]}, code='invalid'
            ) from error
        body = LandUseDeclarationSerializer(data=data)
        body.is_valid(raise_exception=True)
        lot.land_use_unchanged = body.validated_data['unchanged']
        lot.land_use_declared_at = timezone.now()
        lot.save(update_fields=['land_use_unchanged', 'land_use_declared_at'])
        return Response(land_use_declaration(lot))
