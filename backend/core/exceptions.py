"""Manejo de errores de la API: el de DRF, con el aviso del 401 en español de Argentina."""

from typing import Any

from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

LOGIN_REQUIRED = 'Ingresá con tu cuenta para continuar.'


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, exceptions.NotAuthenticated):
        # Se cambia solo el texto: el 401 conserva su encabezado WWW-Authenticate
        exc.detail = exceptions.ErrorDetail(LOGIN_REQUIRED, code=exc.default_code)
    return drf_exception_handler(exc, context)
