"""Cuenca y Caudal: GET de la cuenca, GET del historial y POST del simulador.

Las tres son de lectura (el simulador no guarda nada), así que valen para el dueño y para los
lotes de ejemplo. El punto de salida se elige con ?lat=&lng= (o en el cuerpo del simulador).
"""

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import get_visible_lot
from hydrology import service

UNAVAILABLE = status.HTTP_404_NOT_FOUND


class OutletQuery(serializers.Serializer):
    lat = serializers.FloatField(required=False, min_value=-90, max_value=90)
    lng = serializers.FloatField(required=False, min_value=-180, max_value=180)

    def validate(self, attrs):
        if ('lat' in attrs) != ('lng' in attrs):
            raise serializers.ValidationError('El punto de salida necesita lat y lng.')
        return attrs


class SimulationInput(OutletQuery):
    rain_mm = serializers.FloatField(min_value=1, max_value=500)
    duration_h = serializers.FloatField(min_value=0.5, max_value=72)
    arc = serializers.ChoiceField(choices=service.ARC_LEVELS, default='II')
    hsg = serializers.ChoiceField(choices=service.HSG_LEVELS, required=False)
    residue = serializers.BooleanField(default=True)


def _unavailable(error: service.NotAvailable) -> Response:
    return Response({'available': False, 'detail': str(error)}, status=UNAVAILABLE)


class LotHydrology(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = get_visible_lot(request, lot_id)
        query = OutletQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = service.analysis(
                lot, query.validated_data.get('lat'), query.validated_data.get('lng')
            )
        except service.NotAvailable as error:
            return _unavailable(error)
        return Response({'available': True, **data})


class LotHydrologyHistory(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = get_visible_lot(request, lot_id)
        query = OutletQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = service.history(
                lot, query.validated_data.get('lat'), query.validated_data.get('lng')
            )
        except service.NotAvailable as error:
            return _unavailable(error)
        return Response({'available': True, **data})


class LotHydrologySimulate(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request, lot_id: int) -> Response:
        lot = get_visible_lot(request, lot_id)
        body = SimulationInput(data=request.data)
        body.is_valid(raise_exception=True)
        v = body.validated_data
        try:
            data = service.simulate(
                lot,
                rain_mm=v['rain_mm'],
                duration_h=v['duration_h'],
                arc=v['arc'],
                hsg=v.get('hsg'),
                residue=v['residue'],
                lat=v.get('lat'),
                lng=v.get('lng'),
            )
        except service.NotAvailable as error:
            return _unavailable(error)
        return Response({'available': True, **data}, status=status.HTTP_200_OK)
