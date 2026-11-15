"""Rutas de cuentas. Ver CLAUDE.md, sección 10.

POST /api/auth/register/   alta de cuenta, devuelve el token
POST /api/auth/login/      ingreso, devuelve el token
POST /api/auth/logout/     salida, borra el token
GET  /api/auth/me/         datos de la cuenta del token
"""

from django.urls import path

from accounts.views import Login, Logout, Me, Register

urlpatterns = [
    path('auth/register/', Register.as_view(), name='auth-register'),
    path('auth/login/', Login.as_view(), name='auth-login'),
    path('auth/logout/', Logout.as_view(), name='auth-logout'),
    path('auth/me/', Me.as_view(), name='auth-me'),
]
