"""Rutas de chequeos territoriales. Cada chequeo que necesite escribir (por ejemplo, la
declaración BPA) agrega su ruta acá."""

from django.urls import path

from territory.views import LotTerritorialChecks

urlpatterns = [
    path(
        'lots/<int:lot_id>/territorial-checks/',
        LotTerritorialChecks.as_view(),
        name='lot-territorial-checks',
    ),
]
