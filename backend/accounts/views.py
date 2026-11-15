"""Cuentas de los productores: registro, ingreso, salida y datos propios. Ver CLAUDE.md,
sección 10.

Se usa el token de DRF ("Authorization: Token <key>"), uno por usuario. Registro e ingreso
no leen el token que venga en el pedido y tienen un límite de intentos por IP (scope "auth").
"""

from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import Throttled
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.serializers import LoginSerializer, RegisterSerializer, normalize_email, user_data

INVALID_CREDENTIALS = 'Mail o contraseña incorrectos.'


class TooManyAttempts(Throttled):
    default_detail = 'Hubo demasiados intentos seguidos.'
    extra_detail_singular = 'Probá de nuevo en {wait} segundo.'
    extra_detail_plural = 'Probá de nuevo en {wait} segundos.'


class PublicAuthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def throttled(self, request: Request, wait: float | None) -> None:
        raise TooManyAttempts(wait)


class Register(PublicAuthView):
    """POST /api/auth/register/ {"name" (opcional), "email", "password"}.

    201 {"token", "user"}. 400 por campo, por ejemplo {"email": ["Ya hay una cuenta con ese
    mail."]} o {"password": [mensajes de los validadores de Django]}.
    """

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = Token.objects.create(user=user)
        return Response(
            {'token': token.key, 'user': user_data(user)}, status=status.HTTP_201_CREATED
        )


class Login(PublicAuthView):
    """POST /api/auth/login/ {"email", "password"}.

    200 {"token", "user"}. Credenciales incorrectas: 400 {"detail": "Mail o contraseña
    incorrectos."}, sin decir si el mail tiene cuenta.
    """

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=normalize_email(serializer.validated_data['email']),
            password=serializer.validated_data['password'],
        )
        if user is None:
            return Response({'detail': INVALID_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)
        token, _created = Token.objects.get_or_create(user=user)
        update_last_login(None, user)
        return Response({'token': token.key, 'user': user_data(user)})


class Logout(APIView):
    """POST /api/auth/logout/ (con token): 204 y borra el token."""

    def post(self, request: Request) -> Response:
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class Me(APIView):
    """GET /api/auth/me/ (con token): {"id", "email", "name"}. Sin token o token inválido: 401."""

    def get(self, request: Request) -> Response:
        return Response(user_data(request.user))
