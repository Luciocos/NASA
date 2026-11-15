"""Registro e ingreso con mail y contraseña. Ver CLAUDE.md, sección 10.

El mail se guarda en minúsculas y es el username de Django; el nombre va en first_name.
La contraseña pasa por AUTH_PASSWORD_VALIDATORS y se guarda solo con el hash de Django.
"""

from typing import Any

from django.contrib.auth import password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import serializers

EMAIL_TAKEN = 'Ya hay una cuenta con ese mail.'
# El mail es el username de Django, que admite hasta 150 caracteres
EMAIL_MAX_LENGTH = 150
NAME_MAX_LENGTH = 150

EMAIL_ERRORS = {
    'required': 'Ingresá tu mail.',
    'blank': 'Ingresá tu mail.',
    'null': 'Ingresá tu mail.',
    'invalid': 'Ingresá un mail válido.',
    'max_length': f'El mail puede tener hasta {EMAIL_MAX_LENGTH} caracteres.',
}
PASSWORD_ERRORS = {
    'required': 'Ingresá tu contraseña.',
    'blank': 'Ingresá tu contraseña.',
    'null': 'Ingresá tu contraseña.',
    'invalid': 'Ingresá tu contraseña.',
}


def normalize_email(value: str) -> str:
    return value.strip().lower()


def user_data(user: User) -> dict[str, Any]:
    """Lo único que se muestra de una cuenta, y solo a su dueño."""
    return {'id': user.pk, 'email': user.email, 'name': user.first_name}


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=NAME_MAX_LENGTH,
        required=False,
        allow_blank=True,
        allow_null=True,
        default='',
        error_messages={'max_length': f'El nombre puede tener hasta {NAME_MAX_LENGTH} caracteres.'},
    )
    email = serializers.EmailField(max_length=EMAIL_MAX_LENGTH, error_messages=EMAIL_ERRORS)
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, error_messages=PASSWORD_ERRORS
    )

    def validate_email(self, value: str) -> str:
        email = normalize_email(value)
        if User.objects.filter(Q(username__iexact=email) | Q(email__iexact=email)).exists():
            raise serializers.ValidationError(EMAIL_TAKEN)
        return email

    def validate_password(self, value: str) -> str:
        # La similitud se compara con el mail y el nombre que se van a guardar
        candidate = User(
            email=normalize_email(str(self.initial_data.get('email') or '')),
            first_name=str(self.initial_data.get('name') or ''),
        )
        try:
            password_validation.validate_password(value, user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value

    def create(self, validated_data: dict[str, Any]) -> User:
        email = validated_data['email']
        try:
            with transaction.atomic():
                return User.objects.create_user(
                    username=email,
                    email=email,
                    password=validated_data['password'],
                    first_name=validated_data.get('name') or '',
                )
        except IntegrityError as error:
            # Dos altas al mismo tiempo con el mismo mail: la segunda choca con el username único
            raise serializers.ValidationError({'email': [EMAIL_TAKEN]}) from error


class LoginSerializer(serializers.Serializer):
    # Sin validar el formato: un mail mal escrito es una credencial incorrecta más
    email = serializers.CharField(error_messages=EMAIL_ERRORS)
    password = serializers.CharField(trim_whitespace=False, error_messages=PASSWORD_ERRORS)
