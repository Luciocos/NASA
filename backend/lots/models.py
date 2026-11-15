"""Modelos Lot y Campaign. Ver CLAUDE.md, sección 7."""

from django.conf import settings
from django.db import models

from core.geo import polygon_area_ha
from core.origin import Origin


class Crop(models.TextChoices):
    SOY = 'SOY', 'Soja'
    CORN = 'CORN', 'Maíz'
    WHEAT = 'WHEAT', 'Trigo'
    OTHER = 'OTHER', 'Otro'


class Lot(models.Model):
    name = models.CharField(max_length=200)
    renspa = models.CharField(max_length=50, blank=True)
    locality = models.CharField(max_length=200, blank=True)
    province = models.CharField(max_length=200, blank=True)
    # GeoJSON Polygon en EPSG:4326
    geometry = models.JSONField()
    # Se calcula a partir de geometry al guardar
    area_ha = models.FloatField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Productor dueño del lote: solo él lo ve y lo edita (core/access.py).
    # Los ejemplos públicos no tienen dueño.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='lots',
    )
    # Lotes del pipeline (import_events): cualquiera los ve, nadie los edita
    public_example = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        self.area_ha = polygon_area_ha(self.geometry)
        super().save(*args, **kwargs)


class Campaign(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='campaigns')
    label = models.CharField(max_length=20)  # por ejemplo "2025/26"
    crop = models.CharField(max_length=10, choices=Crop.choices)
    crop_origin = models.CharField(max_length=10, choices=Origin.choices)
    yield_t_ha = models.FloatField(null=True, blank=True)
    yield_origin = models.CharField(max_length=10, choices=Origin.choices, blank=True)

    class Meta:
        ordering = ['label']
        constraints = [
            models.UniqueConstraint(fields=['lot', 'label'], name='unique_campaign_per_lot'),
        ]

    def __str__(self) -> str:
        return f'{self.lot} {self.label}'
