"""Rutas de lotes (Dev B). Ver CLAUDE.md, sección 10.

GET  /api/lots/        lista de lotes con geometría
POST /api/lots/        alta de lote a partir de un polígono
GET  /api/lots/{id}/   ficha del lote con campañas
"""

from django.urls import path  # noqa: F401

urlpatterns: list = []
