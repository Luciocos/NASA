"""Rutas de Cuenca y Caudal. Todas de lectura: el simulador no guarda nada."""

from django.urls import path

from hydrology.views import LotHydrology, LotHydrologyHistory, LotHydrologySimulate

urlpatterns = [
    path('lots/<int:lot_id>/hydrology/', LotHydrology.as_view(), name='lot-hydrology'),
    path(
        'lots/<int:lot_id>/hydrology/history/',
        LotHydrologyHistory.as_view(),
        name='lot-hydrology-history',
    ),
    path(
        'lots/<int:lot_id>/hydrology/simulate/',
        LotHydrologySimulate.as_view(),
        name='lot-hydrology-simulate',
    ),
]
