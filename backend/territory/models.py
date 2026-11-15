"""Datos propios de los chequeos territoriales."""

from django.db import models

from lots.models import Lot


class BpaDeclaration(models.Model):
    """Lo que el productor declaró sobre su adhesión a Buenas Prácticas Agrícolas provinciales.

    Es un dato DECLARED: no se contrasta contra ningún registro oficial. Hay a lo sumo una por
    lote; declarar otra vez la pisa.
    """

    lot = models.OneToOneField(Lot, on_delete=models.CASCADE, related_name='bpa_declaration')
    adheres = models.BooleanField()
    registration_number = models.CharField(max_length=64, blank=True)
    program = models.CharField(max_length=200, blank=True)
    declared_at = models.DateTimeField()

    def __str__(self) -> str:
        return f'BPA {self.lot_id}: {"adhiere" if self.adheres else "no adhiere"}'
