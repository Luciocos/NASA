"""Rutas de huella, simulador y puntaje (Dev C). Ver CLAUDE.md, secciones 9 y 10.

GET  /api/lots/{id}/footprint/?campaign=   huella con desglose y orígenes
POST /api/lots/{id}/simulate/              simulador (no persiste nada)
GET  /api/lots/{id}/score/                 puntaje de sustentabilidad
"""

from django.urls import path  # noqa: F401

urlpatterns: list = []
