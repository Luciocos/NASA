"""Rutas de la bitácora de eventos (Dev B). Ver CLAUDE.md, sección 10.

GET   /api/lots/{id}/events/   bitácora, filtros: type, campaign, sensor
PATCH /api/events/{id}/        el usuario confirma o corrige un evento
"""

from django.urls import path  # noqa: F401

urlpatterns: list = []
