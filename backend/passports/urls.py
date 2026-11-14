"""Rutas del pasaporte público (Dev C). Ver CLAUDE.md, sección 10.

POST /api/lots/{id}/passport/   genera enlace público
GET  /api/passports/{token}/    vista pública de solo lectura
"""

from django.urls import path

from passports.views import LotPassportCreate, PassportPublic

urlpatterns = [
    path('lots/<int:lot_id>/passport/', LotPassportCreate.as_view(), name='lot-passport'),
    path('passports/<uuid:token>/', PassportPublic.as_view(), name='passport-public'),
]
