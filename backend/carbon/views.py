"""Vistas de huella, simulador y puntaje. Ver CLAUDE.md, secciones 9 y 10.

La lógica vive en footprint.py, score.py y simulator.py. Las vistas solo leen el lote,
cargan factores y pesos de los YAML y devuelven el resultado. Solo la declaración escribe.

Huella, puntaje y simulador los ve el dueño o cualquiera en un ejemplo público; declarar es
solo del dueño. Las reglas viven en core/access.py.
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from carbon.config import load_factors, load_weights
from carbon.data import load_lot_data
from carbon.declaration import InvalidDeclaration, apply_declaration, parse_declaration
from carbon.footprint import compute_footprint
from carbon.reference import with_references
from carbon.score import compute_score
from carbon.simulator import InvalidChanges, simulate
from core.access import get_owned_lot, get_visible_lot


class LotFootprint(APIView):
    """GET /api/lots/{id}/footprint/?campaign=<id o etiqueta>

    Sin campaign se usa la última campaña del lote. Campaña inexistente: 404.
    Nunca falla por falta de factores o insumos: los informa como "sin dato".
    """

    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = with_references(load_lot_data(get_visible_lot(request, lot_id)))
        value = request.query_params.get('campaign')
        campaign = lot.find_campaign(value)
        if value and campaign is None:
            return Response(
                {'detail': 'El lote no tiene una campaña con ese id o etiqueta.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(compute_footprint(lot, campaign, load_factors()))


class LotScore(APIView):
    """GET /api/lots/{id}/score/: puntaje provisional con cada criterio y su origen."""

    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = load_lot_data(get_visible_lot(request, lot_id))
        return Response(compute_score(lot, load_weights()))


class LotSimulate(APIView):
    """POST /api/lots/{id}/simulate/ con cuerpo {"cover_crop": true, "campaign": "2025/26"}.

    Devuelve huella y puntaje antes y después. No persiste nada, por eso se permite también
    en los ejemplos públicos.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request, lot_id: int) -> Response:
        lot = with_references(load_lot_data(get_visible_lot(request, lot_id)))
        try:
            result = simulate(lot, request.data, load_factors(), load_weights())
        except InvalidChanges as error:
            return Response(error.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class LotDeclaration(APIView):
    """POST /api/lots/{id}/declaration/: el productor declara rendimiento e insumos.

    Lo declarado reemplaza al valor de referencia (ver carbon/declaration.py).
    Responde la huella recalculada de esa campaña. Solo el dueño: exige token, un ejemplo
    público da 403 y un lote ajeno, 404.
    """

    def post(self, request: Request, lot_id: int) -> Response:
        lot = get_owned_lot(request, lot_id)
        try:
            campaign = apply_declaration(lot, parse_declaration(request.data))
        except InvalidDeclaration as error:
            return Response(error.errors, status=status.HTTP_400_BAD_REQUEST)
        data = with_references(load_lot_data(lot))
        return Response(compute_footprint(data, data.find_campaign(campaign.pk), load_factors()))
