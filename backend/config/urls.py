"""Rutas raíz. Cada app por funcionalidad declara sus propias rutas bajo /api/.

Para agregar un endpoint, editar el urls.py de la app que corresponda,
no este archivo. Así cada dev trabaja en su carpeta sin pisarse.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/', include('accounts.urls')),
    path('api/', include('lots.urls')),
    path('api/', include('events.urls')),
    path('api/', include('carbon.urls')),
    path('api/', include('passports.urls')),
    path('api/', include('territory.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
