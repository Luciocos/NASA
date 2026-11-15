"""Autenticación por token de DRF. Ver CLAUDE.md, sección 10.

El frontend manda "Authorization: Token <key>". Un token borrado (por ejemplo, después de
salir desde otro dispositivo) cuenta como si no se hubiera enviado: las rutas públicas
(ejemplos, pasaporte, ingreso) siguen respondiendo y las privadas dan 401 igual que sin token.
"""

from rest_framework import authentication, exceptions


class TokenAuthentication(authentication.TokenAuthentication):
    def authenticate_credentials(self, key: str):
        try:
            return super().authenticate_credentials(key)
        except exceptions.AuthenticationFailed:
            return None
