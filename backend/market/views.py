"""GET /api/market/suggested-price/?crop=SOY&campaign=2026/27: precio sugerido de Rofex."""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from market.rofex import (
    MarketUnavailable,
    NotConfigured,
    UnsupportedCrop,
    harvest_symbol,
    suggested_price,
)

DISCLAIMER = (
    'Precio sugerido de mercado, para tomar como referencia: no es una cotización en firme ni '
    'una recomendación comercial. Podés cambiarlo.'
)


class SuggestedPriceView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        crop = request.query_params.get('crop', 'SOY').upper()
        try:
            symbol = harvest_symbol(crop, request.query_params.get('campaign'))
        except (UnsupportedCrop, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            price = suggested_price(symbol)
        except NotConfigured as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MarketUnavailable as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(price.to_dict() | {'crop': crop, 'disclaimer': DISCLAIMER})
