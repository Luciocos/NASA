"""Modelo Passport: enlace público de un lote. Ver CLAUDE.md, sección 7."""

import uuid

from django.db import models

from lots.models import Lot


class Passport(models.Model):
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='passports')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f'Pasaporte de {self.lot}'
