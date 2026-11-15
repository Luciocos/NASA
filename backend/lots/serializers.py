"""Serializers de lotes y campañas. Ver CLAUDE.md, secciones 7 y 10."""

from collections.abc import Mapping
from typing import Any

from rest_framework import serializers
from rest_framework.fields import empty
from rest_framework.settings import api_settings

from core.access import is_owner
from core.geo import validate_polygon
from core.origin import Origin
from lots.models import Campaign, Lot

# Errores de POST /api/lots/{id}/land-use/
LAND_USE_MISSING = (
    'Indicá si el uso del suelo cambió desde 2020: true si no cambió, false si cambió.'
)
LAND_USE_INVALID = 'Debe ser true o false.'
FIELD_NOT_ALLOWED = 'Campo no admitido.'
BODY_NOT_OBJECT = 'El cuerpo debe ser un objeto JSON con el campo unchanged.'


def land_use_declaration(lot: Lot) -> dict[str, Any] | None:
    """Lo que el productor declaró sobre el uso del suelo desde 2020, o None si no declaró.

    Es la respuesta de POST /api/lots/{id}/land-use/ y el campo land_use_declaration de la
    ficha: {"unchanged", "declared_at" (ISO 8601), "origin": "DECLARED"}. Un valor sin fecha no
    cuenta como declaración: el endpoint guarda siempre los dos juntos.
    """
    if lot.land_use_unchanged is None or lot.land_use_declared_at is None:
        return None
    return {
        'unchanged': lot.land_use_unchanged,
        'declared_at': serializers.DateTimeField().to_representation(lot.land_use_declared_at),
        'origin': Origin.DECLARED.value,
    }


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
    """Ficha del lote: los datos de la lista más sus campañas y la declaración de uso del suelo.

    land_use_declaration es de solo lectura: el alta no la acepta y se declara con
    POST /api/lots/{id}/land-use/. La lista de lotes no la trae.
    """

    campaigns = CampaignSerializer(many=True, read_only=True)
    land_use_declaration = serializers.SerializerMethodField()

    class Meta(LotSerializer.Meta):
        fields = [*LotSerializer.Meta.fields, 'campaigns', 'land_use_declaration']

    def get_land_use_declaration(self, lot: Lot) -> dict[str, Any] | None:
        return land_use_declaration(lot)


class JSONBooleanField(serializers.BooleanField):
    """Solo true o false de JSON.

    BooleanField acepta también "true", 1 o "sí", y en un formulario toma como false un campo
    que no vino: acá eso es un error, para no guardar una declaración que nadie hizo.
    """

    default_empty_html = empty

    def to_internal_value(self, data: Any) -> bool:
        if not isinstance(data, bool):
            self.fail('invalid', input=data)
        return data


class LandUseDeclarationSerializer(serializers.Serializer):
    """Cuerpo de POST /api/lots/{id}/land-use/: {"unchanged": true|false}.

    true: el productor declara que el lote no cambió de uso del suelo desde 2020. false: que sí.
    Otro campo, o un cuerpo que no sea un objeto JSON, da 400.
    """

    unchanged = JSONBooleanField(
        error_messages={
            'required': LAND_USE_MISSING,
            'null': LAND_USE_MISSING,
            'invalid': LAND_USE_INVALID,
        }
    )

    def run_validation(self, data: Any = empty) -> Any:
        # El mismo error para una lista, un texto o null (a null DRF responde en inglés)
        if not isinstance(data, Mapping):
            raise serializers.ValidationError(
                {api_settings.NON_FIELD_ERRORS_KEY: [BODY_NOT_OBJECT]}, code='invalid'
            )
        return super().run_validation(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        unknown = sorted(set(self.initial_data) - set(self.fields))
        if unknown:
            raise serializers.ValidationError({field: [FIELD_NOT_ALLOWED] for field in unknown})
        return attrs
