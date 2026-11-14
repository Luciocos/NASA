"""Rutas de huella, simulador y puntaje (Dev C). Ver CLAUDE.md, secciones 9 y 10.

GET  /api/lots/{id}/footprint/?campaign=   huella con desglose y orígenes
POST /api/lots/{id}/simulate/              simulador (no persiste nada)
GET  /api/lots/{id}/score/                 puntaje de sustentabilidad
"""

from django.urls import path

from carbon.views import LotFootprint, LotScore, LotSimulate

urlpatterns = [
    path('lots/<int:lot_id>/footprint/', LotFootprint.as_view(), name='lot-footprint'),
    path('lots/<int:lot_id>/simulate/', LotSimulate.as_view(), name='lot-simulate'),
    path('lots/<int:lot_id>/score/', LotScore.as_view(), name='lot-score'),
]
