"""Rutas de la bitácora de eventos (Dev B). Ver CLAUDE.md, sección 10.

GET   /api/lots/{id}/events/   bitácora, filtros: type, campaign, sensor
PATCH /api/events/{id}/        el usuario confirma o corrige un evento
"""

from django.urls import path

from events.views import EventReview, LotEventList

urlpatterns = [
    path('lots/<int:lot_id>/events/', LotEventList.as_view(), name='lot-events'),
    path('events/<int:pk>/', EventReview.as_view(), name='event-review'),
]
