"""POST /api/lots/{id}/bpa/: el dueño declara si adhiere a Buenas Prácticas Agrícolas."""

from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ParseError, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from core.access import get_owned_lot
from lots.models import Lot
from territory.checks import bpa
from territory.models import BpaDeclaration

BODY_NOT_OBJECT = 'El cuerpo debe ser un objeto JSON con el campo adheres.'


class BpaDeclarationSerializer(serializers.Serializer):
    # true: adhiere; false: no adhiere; null: borra la declaración
    adheres = serializers.BooleanField(allow_null=True)
    registration_number = serializers.CharField(
        max_length=64, required=False, allow_blank=True, allow_null=True, trim_whitespace=True
    )
    program = serializers.CharField(
        max_length=200, required=False, allow_blank=True, allow_null=True, trim_whitespace=True
    )


class LotBpaDeclaration(APIView):
    """POST /api/lots/{id}/bpa/ con {"adheres": true|false|null, "registration_number": "..."}.

    Guarda (o pisa) la declaración del productor como dato DECLARED; con adheres null la borra.
    Responde el CheckResult del chequeo 'bpa' actualizado. Solo el dueño (core/access.py): sin
    token 401, un ejemplo público 403 y un lote ajeno o inexistente, 404.
    """

    def post(self, request: Request, lot_id: int) -> Response:
        lot = get_owned_lot(request, lot_id)
        try:
            data = request.data
        except ParseError as error:
            raise ValidationError(
                {api_settings.NON_FIELD_ERRORS_KEY: [BODY_NOT_OBJECT]}, code='invalid'
            ) from error
        if not isinstance(data, dict):
            raise ValidationError({api_settings.NON_FIELD_ERRORS_KEY: [BODY_NOT_OBJECT]})
        body = BpaDeclarationSerializer(data=data)
        body.is_valid(raise_exception=True)
        values = body.validated_data

        if values['adheres'] is None:
            BpaDeclaration.objects.filter(lot=lot).delete()
        else:
            BpaDeclaration.objects.update_or_create(
                lot=lot,
                defaults={
                    'adheres': values['adheres'],
                    # Si no adhiere, un número de inscripción no tiene sentido
                    'registration_number': (values.get('registration_number') or '')
                    if values['adheres']
                    else '',
                    'program': values.get('program') or '',
                    'declared_at': timezone.now(),
                },
            )
        # Se relee el lote para no usar la relación cacheada
        return Response(bpa.run(Lot.objects.get(pk=lot.pk)).to_dict())
