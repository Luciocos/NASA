"""Vistas de la bitácora de eventos. Ver CLAUDE.md, sección 10.

Los permisos por lote viven en core/access.py.
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import check_owner, get_visible_lot, not_found
from core.origin import Origin
from events.models import Event, EventType, Sensor
from events.serializers import EventReviewSerializer, EventSerializer

EMPTY_LOG_MESSAGE = (
    'Este lote todavía no tiene eventos registrados. Los eventos se cargan a partir '
    'de observaciones satelitales procesadas; no se generan automáticamente.'
)
NO_MATCH_MESSAGE = 'Ningún evento coincide con los filtros elegidos.'

# Campos que, si el usuario los cambia, pasan a ser dato declarado por él.
CORRECTABLE_FIELDS = ('type', 'date', 'date_uncertainty_days')


class LotEventList(APIView):
    """GET /api/lots/{id}/events/: bitácora del lote, ordenada por fecha.

    Filtros opcionales por query string:
    - type: código de EventType (por ejemplo TILLAGE).
    - sensor: código de Sensor (por ejemplo NISAR).
    - campaign: si es un número entero se toma como id de la campaña; si no, como su
      etiqueta (por ejemplo 2025/26).

    Respuesta: {"lot", "count", "message", "events"}. message es null cuando hay
    eventos, y explica el motivo cuando la lista está vacía (sin eventos o sin
    coincidencias). Nunca se generan eventos de relleno.

    Lo ve el dueño del lote, o cualquiera si es un ejemplo público. Si no, 404.
    """

    permission_classes = [AllowAny]

    def get(self, request: Request, lot_id: int) -> Response:
        lot = get_visible_lot(request, lot_id)
        events = Event.objects.filter(lot=lot).select_related('campaign')
        has_any = events.exists()

        errors: dict[str, list[str]] = {}
        event_type = request.query_params.get('type')
        if event_type:
            if event_type not in EventType.values:
                errors['type'] = [f'Tipo desconocido. Opciones: {", ".join(EventType.values)}.']
            events = events.filter(type=event_type)

        sensor = request.query_params.get('sensor')
        if sensor:
            if sensor not in Sensor.values:
                errors['sensor'] = [f'Sensor desconocido. Opciones: {", ".join(Sensor.values)}.']
            events = events.filter(sensor=sensor)

        campaign = request.query_params.get('campaign')
        if campaign:
            if campaign.isdigit():
                events = events.filter(campaign_id=int(campaign))
            else:
                events = events.filter(campaign__label=campaign)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        data = EventSerializer(events, many=True).data
        message = None
        if not has_any:
            message = EMPTY_LOG_MESSAGE
        elif not data:
            message = NO_MATCH_MESSAGE
        return Response({'lot': lot.pk, 'count': len(data), 'message': message, 'events': data})


class EventReview(APIView):
    """PATCH /api/events/{id}/: el usuario confirma o corrige un evento.

    Cuerpo (todos opcionales, al menos uno):
    - confirm (bool): el usuario confirma el evento tal como está.
    - type, date, date_uncertainty_days: corrección del evento.
    - notes: comentario libre del usuario.

    Reglas, sin campos nuevos en el modelo:
    - Si se corrige type, date o date_uncertainty_days con un valor distinto, el dato pasa
      a origin DECLARED: el valor ahora lo informa el productor, no el satélite.
      sensor, confidence, evidencia y métricas se conservan: describen la detección
      original y siguen sirviendo como respaldo.
    - Confirmar un evento ESTIMATED lo pasa a DECLARED (el productor lo respalda).
      Confirmar un evento VERIFIED o DECLARED no cambia nada: ya tiene respaldo.
      La confirmación en sí no se guarda como un campo aparte.
    - Cambiar solo notes no altera el origen.
    - is_simulated nunca cambia: un evento simulado sigue siéndolo aunque se corrija.
    - Cualquier otro campo en el cuerpo devuelve 400.

    Solo el dueño del lote: exige token, un ejemplo público da 403 y un lote ajeno, 404.
    Responde el evento actualizado con el mismo formato que la bitácora.
    """

    def patch(self, request: Request, pk: int) -> Response:
        event = Event.objects.select_related('campaign', 'lot').filter(pk=pk).first()
        if event is None:
            raise not_found()
        check_owner(request, event.lot)
        review = EventReviewSerializer(data=request.data)
        review.is_valid(raise_exception=True)
        changes = dict(review.validated_data)
        confirm = changes.pop('confirm', False)

        corrected = False
        for field, value in changes.items():
            if field in CORRECTABLE_FIELDS and getattr(event, field) != value:
                corrected = True
            setattr(event, field, value)

        if corrected or (confirm and event.origin == Origin.ESTIMATED):
            event.origin = Origin.DECLARED

        event.full_clean()
        event.save()
        return Response(EventSerializer(event).data)
