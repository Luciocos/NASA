"""Serializers de la bitácora de eventos. Ver CLAUDE.md, secciones 7 y 10."""

from django.core.files.storage import default_storage
from rest_framework import serializers

from events.models import Event, EventType


def evidence_url(path: str) -> str | None:
    """URL pública de una imagen de evidencia (ruta relativa a data/), o None si no hay.

    Con MEDIA_URL = 'media/' queda, por ejemplo, '/media/evidence/lote1_nisar.png'.
    El frontend usa estas URL tal cual y no arma rutas por su cuenta.
    """
    return default_storage.url(path) if path else None


class EventSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source='get_type_display', read_only=True)
    sensor_label = serializers.CharField(source='get_sensor_display', read_only=True)
    campaign_label = serializers.CharField(source='campaign.label', read_only=True, default=None)
    evidence_image_url = serializers.SerializerMethodField()
    evidence_optical_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            'id',
            'lot',
            'campaign',
            'campaign_label',
            'type',
            'type_label',
            'date',
            'date_uncertainty_days',
            'sensor',
            'sensor_label',
            'origin',
            'confidence',
            'evidence_image',
            'evidence_image_url',
            'evidence_optical_image',
            'evidence_optical_image_url',
            'metrics',
            'is_simulated',
            'notes',
        ]
        read_only_fields = fields

    def get_evidence_image_url(self, event: Event) -> str | None:
        return evidence_url(event.evidence_image)

    def get_evidence_optical_image_url(self, event: Event) -> str | None:
        return evidence_url(event.evidence_optical_image)


class EventReviewSerializer(serializers.Serializer):
    """Cuerpo de PATCH /api/events/{id}/. Ver la docstring de EventReview."""

    confirm = serializers.BooleanField(required=False, default=False)
    type = serializers.ChoiceField(choices=EventType.choices, required=False)
    date = serializers.DateField(required=False)
    date_uncertainty_days = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs: dict) -> dict:
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {field: ['Este campo no se puede modificar.'] for field in sorted(unknown)}
            )
        if not attrs.get('confirm') and len(attrs) == 1:
            raise serializers.ValidationError(
                'Enviar confirm: true o al menos un campo a corregir '
                '(type, date, date_uncertainty_days, notes).'
            )
        return attrs
