"""Pasaporte del lote: enlace público de solo lectura. Ver CLAUDE.md, secciones 2 y 10.

POST /api/lots/{id}/passport/
    Crea un pasaporte con token UUID. Cuerpo opcional: {"expires_in_days": 30}.
    Responde 201 con el token y la ruta pública del frontend (/pasaporte/<token>).
    El dueño del lote genera uno nuevo cada vez: exige token y un lote ajeno da 404
    (core/access.py). Un ejemplo público ya es visible para cualquiera, así que cualquiera
    (con o sin cuenta) comparte su pasaporte: siempre el mismo, sin vencimiento, para no
    sumar uno por visita. Ahí no se lee expires_in_days, y responde 200 si ya existía.

GET /api/passports/{token}/
    Vista pública: lote, campañas, bitácora, resumen de huella y puntaje, fecha de
    generación y descargo. Token inexistente: 404. Pasaporte vencido (expires_at en el
    pasado): 410 Gone, para distinguirlo de un enlace mal copiado. No muestra quién es el
    dueño: el enlace lo comparte el productor.
"""

import datetime

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from carbon.config import load_factors, load_weights
from carbon.data import load_lot_data
from carbon.footprint import DISCLAIMER, compute_footprint
from carbon.reference import with_references
from carbon.score import compute_score
from core.access import get_owned_lot
from events.serializers import EventSerializer
from lots.models import Lot
from lots.serializers import LotDetailSerializer
from passports.models import Passport

DATA_NOTICE = 'Usa datos abiertos de la NASA.'
EXPIRED_MESSAGE = 'Este pasaporte venció y ya no está disponible.'


def public_path(passport: Passport) -> str:
    return f'/pasaporte/{passport.token}'


def link_payload(passport: Passport) -> dict[str, object]:
    return {
        'token': str(passport.token),
        'lot': passport.lot_id,
        'url': public_path(passport),
        'created_at': passport.created_at,
        'expires_at': passport.expires_at,
    }


class LotPassportCreate(APIView):
    # Un ejemplo se comparte sin cuenta; para un lote propio, el token se pide abajo
    permission_classes = [AllowAny]

    def post(self, request: Request, lot_id: int) -> Response:
        example = Lot.objects.filter(pk=lot_id, public_example=True).first()
        if example is not None:
            return self.example_passport(example)
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        lot = get_owned_lot(request, lot_id)
        days = request.data.get('expires_in_days') if isinstance(request.data, dict) else None
        expires_at = None
        if days is not None:
            if isinstance(days, bool) or not isinstance(days, int) or days < 1:
                return Response(
                    {'expires_in_days': ['Debe ser un número entero de días, mayor que cero.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            expires_at = timezone.now() + datetime.timedelta(days=days)
        passport = Passport.objects.create(lot=lot, expires_at=expires_at)
        return Response(link_payload(passport), status=status.HTTP_201_CREATED)

    @staticmethod
    def example_passport(lot: Lot) -> Response:
        """El pasaporte del ejemplo: el primero sin vencimiento, o uno nuevo si no hay."""
        passport = lot.passports.filter(expires_at__isnull=True).order_by('created_at').first()
        if passport is not None:
            return Response(link_payload(passport))
        passport = Passport.objects.create(lot=lot)
        return Response(link_payload(passport), status=status.HTTP_201_CREATED)


class PassportPublic(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, token: str) -> Response:
        passport = get_object_or_404(Passport.objects.select_related('lot'), token=token)
        if passport.expires_at is not None and passport.expires_at <= timezone.now():
            return Response({'detail': EXPIRED_MESSAGE}, status=status.HTTP_410_GONE)

        lot = (
            Lot.objects.annotate(event_count=Count('events'))
            .prefetch_related('campaigns')
            .get(pk=passport.lot_id)
        )
        events = lot.events.select_related('campaign').order_by('date', 'id')
        data = with_references(load_lot_data(lot))
        footprint = compute_footprint(data, data.find_campaign(None), load_factors())
        score = compute_score(data, load_weights())
        return Response(
            {
                'token': str(passport.token),
                'generated_at': timezone.now(),
                'created_at': passport.created_at,
                'expires_at': passport.expires_at,
                'lot': LotDetailSerializer(lot, context={'request': request}).data,
                'events': EventSerializer(events, many=True).data,
                'footprint': footprint,
                'score': score,
                'uses_simulated_data': (
                    any(e.is_simulated for e in data.events) or footprint['uses_simulated_data']
                ),
                'disclaimer': DISCLAIMER,
                'data_notice': DATA_NOTICE,
            }
        )
