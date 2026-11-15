"""GET /api/lots/{id}/territorial-checks/: cruces indicativos del lote con capas públicas."""

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import get_visible_lot
from territory.checks import run_all

DISCLAIMER = (
    'Cruce con capas públicas, indicativo. No reemplaza asesoramiento legal ni constituye '
    'una auditoría.'
)


class LotTerritorialChecks(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = get_visible_lot(request, lot_id)
        return Response(
            {
                'lot': lot.pk,
                'disclaimer': DISCLAIMER,
                'checks': [result.to_dict() for result in run_all(lot)],
            }
        )
