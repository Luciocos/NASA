"""Enum Origin, compartido por todas las apps. Ver CLAUDE.md, sección 7.

Es código común: cambiarlo solo con acuerdo del equipo.
"""

from django.db import models


class Origin(models.TextChoices):
    VERIFIED = 'VERIFIED', 'Verificado'  # observado por satélite
    DECLARED = 'DECLARED', 'Declarado'  # informado por el productor o el acopio
    ESTIMATED = 'ESTIMATED', 'Estimado'  # valor regional o por defecto
