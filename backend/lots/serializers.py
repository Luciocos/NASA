"""Serializers de lotes y campañas. Ver CLAUDE.md, secciones 7 y 10."""

from typing import Any

from rest_framework import serializers

from core.access import is_owner
from core.geo import validate_polygon
from lots.models import Campaign, Lot


class CampaignSerializer(serializers.ModelSerializer):
    crop_label = serializers.CharField(source='get_crop_display', read_only=True)

    class Meta:
        model = Campaign
        fields = [
            'id',
            'lot',
            'label',
            'crop',
            'crop_label',
            'crop_origin',
            'yield_t_ha',
            'yield_origin',
        ]
        read_only_fields = fields


class LotSerializer(serializers.ModelSerializer):
    """Lote con geometría. Se usa para la lista y para el alta (POST).

    En el alta solo se aceptan name, renspa, locality, province y geometry.
    El área se calcula en el modelo a partir del polígono. El dueño lo pone la vista.

    is_example: es un ejemplo público (solo lectura). owned: el usuario del pedido es el dueño.
    No se expone quién es el dueño.
    """

    renspa = serializers.CharField(
        max_length=50, required=False, allow_blank=True, allow_null=True, default=''
    )
    event_count = serializers.IntegerField(read_only=True, default=0)
    is_example = serializers.BooleanField(source='public_example', read_only=True)
    owned = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            'id',
            'name',
            'renspa',
            'locality',
            'province',
            'geometry',
            'area_ha',
            'event_count',
            'created_at',
            'is_example',
            'owned',
        ]
        read_only_fields = ['id', 'area_ha', 'event_count', 'created_at']

    def get_owned(self, lot: Lot) -> bool:
        request = self.context.get('request')
        return request is not None and is_owner(request.user, lot)

    def validate_renspa(self, value: str | None) -> str:
        return value or ''

    def validate_geometry(self, value: Any) -> Any:
        errors = validate_polygon(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value


class LotDetailSerializer(LotSerializer):
    """Ficha del lote: los datos de la lista más sus campañas."""

    campaigns = CampaignSerializer(many=True, read_only=True)

    class Meta(LotSerializer.Meta):
        fields = [*LotSerializer.Meta.fields, 'campaigns']
