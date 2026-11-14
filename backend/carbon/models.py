"""Modelo InputRecord: insumos y labores de una campaña. Ver CLAUDE.md, sección 7."""

from django.db import models

from core.origin import Origin
from lots.models import Campaign


class InputCategory(models.TextChoices):
    FERTILIZER_N = 'FERTILIZER_N', 'Fertilizante nitrogenado'
    FERTILIZER_P = 'FERTILIZER_P', 'Fertilizante fosforado'
    FERTILIZER_OTHER = 'FERTILIZER_OTHER', 'Otro fertilizante'
    PESTICIDE = 'PESTICIDE', 'Fitosanitario'
    DIESEL = 'DIESEL', 'Gasoil'
    SEED = 'SEED', 'Semilla'


class InputRecord(models.Model):
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='inputs')
    category = models.CharField(max_length=20, choices=InputCategory.choices)
    quantity = models.FloatField()
    unit = models.CharField(max_length=20)
    origin = models.CharField(max_length=10, choices=Origin.choices)
    is_simulated = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f'{self.get_category_display()}: {self.quantity} {self.unit}'
