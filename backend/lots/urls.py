"""Rutas de lotes (Dev B). Ver CLAUDE.md, sección 10.

GET  /api/lots/                 lotes del usuario, con geometría (exige token)
POST /api/lots/                 alta de lote a partir de un polígono, con el usuario como dueño
GET  /api/lots/{id}/            ficha del lote con campañas (dueño o ejemplo público)
POST /api/lots/{id}/land-use/   el dueño declara si el lote cambió de uso del suelo desde 2020
GET  /api/examples/             lotes de ejemplo, públicos y de solo lectura
"""

from django.urls import path

from lots.views import ExampleLotList, LotDetail, LotLandUse, LotListCreate

urlpatterns = [
    path('lots/', LotListCreate.as_view(), name='lot-list'),
    path('lots/<int:pk>/', LotDetail.as_view(), name='lot-detail'),
    path('lots/<int:lot_id>/land-use/', LotLandUse.as_view(), name='lot-land-use'),
    path('examples/', ExampleLotList.as_view(), name='lot-examples'),
]
