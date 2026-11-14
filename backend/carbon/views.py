"""Vistas de huella, simulador y puntaje. Ver CLAUDE.md, secciones 9 y 10.

La lógica vive en footprint.py, score.py y simulator.py. Las vistas solo leen el lote,
cargan factores y pesos de los YAML y devuelven el resultado. Nada se escribe en la base.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from carbon.config import load_factors, load_weights
from carbon.data import load_lot_data
from carbon.footprint import compute_footprint
from carbon.score import compute_score
from carbon.simulator import InvalidChanges, simulate
from lots.models import Lot


class LotFootprint(APIView):
    """GET /api/lots/{id}/footprint/?campaign=<id o etiqueta>

    Sin campaign se usa la última campaña del lote. Campaña inexistente: 404.
    Nunca falla por falta de factores o insumos: los informa como "sin dato".
    """

    def get(self, request: Request, lot_id: int) -> Response:
        lot = load_lot_data(get_object_or_404(Lot, pk=lot_id))
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

    def get(self, request: Request, lot_id: int) -> Response:
        lot = load_lot_data(get_object_or_404(Lot, pk=lot_id))
        return Response(compute_score(lot, load_weights()))


class LotSimulate(APIView):
    """POST /api/lots/{id}/simulate/ con cuerpo {"cover_crop": true, "campaign": "2025/26"}.

    Devuelve huella y puntaje antes y después. No persiste nada.
    """

    def post(self, request: Request, lot_id: int) -> Response:
        lot = load_lot_data(get_object_or_404(Lot, pk=lot_id))
        try:
            result = simulate(lot, request.data, load_factors(), load_weights())
        except InvalidChanges as error:
            return Response(error.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
