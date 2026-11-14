"""Modelo Event: la bitácora del lote. Ver CLAUDE.md, sección 7."""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.origin import Origin
from lots.models import Campaign, Lot


class EventType(models.TextChoices):
    SOWING = 'SOWING', 'Siembra'
    HARVEST = 'HARVEST', 'Cosecha'
    TILLAGE = 'TILLAGE', 'Remoción de suelo'
    COVER_CROP = 'COVER_CROP', 'Cultivo de cobertura'
    FLOODING = 'FLOODING', 'Anegamiento'
    BURN = 'BURN', 'Quema'
    LAND_USE_CHANGE = 'LAND_USE_CHANGE', 'Cambio de uso del suelo'


class Sensor(models.TextChoices):
    """Sensor real que originó el dato. No rotular como NISAR un dato de otro sensor."""

    NISAR = 'NISAR', 'NISAR'
    SENTINEL1 = 'SENTINEL1', 'Sentinel-1'
    HLS = 'HLS', 'HLS'
    LANDSAT = 'LANDSAT', 'Landsat'
    MODIS = 'MODIS', 'MODIS'
    VIIRS = 'VIIRS', 'VIIRS'
    SMAP = 'SMAP', 'SMAP'
    MANUAL = 'MANUAL', 'Manual'


class Event(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='events')
    campaign = models.ForeignKey(
        Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='events'
    )
    type = models.CharField(max_length=20, choices=EventType.choices)
    date = models.DateField()  # fecha de detección
    date_uncertainty_days = models.PositiveIntegerField(null=True, blank=True)
    sensor = models.CharField(max_length=10, choices=Sensor.choices)
    origin = models.CharField(max_length=10, choices=Origin.choices)
    confidence = models.FloatField(
        null=True, blank=True, validators=[MinValueValidator(0.0), MaxValueValidator(1.0)]
    )
    # Rutas relativas a data/, por ejemplo "evidence/lote1_2026-10-12_nisar.png"
    evidence_image = models.CharField(max_length=300, blank=True)
    evidence_optical_image = models.CharField(max_length=300, blank=True)
    # JSON libre: backscatter, coherencia, NDVI, etc.
    metrics = models.JSONField(default=dict, blank=True)
    is_simulated = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['date', 'id']

    def __str__(self) -> str:
        return f'{self.get_type_display()} {self.date} ({self.lot})'
