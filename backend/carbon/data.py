"""Foto en memoria de los datos de un lote que usa el módulo de carbono.

El cálculo de huella, el puntaje y el simulador trabajan sobre estas estructuras, no
sobre los modelos de Django. Así:
- las pruebas arman datos sin tocar la base;
- el simulador aplica cambios hipotéticos sobre una copia y nunca persiste nada.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from core.origin import Origin
from lots.models import Lot

# Orden de respaldo de un dato: más alto, más confiable.
ORIGIN_RANK: dict[str, int] = {Origin.ESTIMATED: 0, Origin.DECLARED: 1, Origin.VERIFIED: 2}


def weakest_origin(origins: list[str]) -> str | None:
    """El origen menos respaldado de una lista (None si está vacía)."""
    return min(origins, key=lambda origin: ORIGIN_RANK[origin]) if origins else None


def strongest_origin(origins: list[str]) -> str | None:
    """El origen más respaldado de una lista (None si está vacía)."""
    return max(origins, key=lambda origin: ORIGIN_RANK[origin]) if origins else None


@dataclass(frozen=True)
class EventData:
    type: str
    date: datetime.date
    origin: str
    is_simulated: bool = False
    # True solo para eventos agregados por el simulador: no existen en la base.
    hypothetical: bool = False
    campaign_label: str | None = None


@dataclass(frozen=True)
class InputData:
    category: str
    quantity: float
    unit: str
    origin: str
    is_simulated: bool = False
    # Fuente del valor de referencia (reference_values.yaml). None si es un dato del lote.
    reference: str | None = None


@dataclass(frozen=True)
class CampaignData:
    id: int | None
    label: str
    crop: str
    crop_origin: str
    yield_t_ha: float | None = None
    yield_origin: str = ''
    inputs: tuple[InputData, ...] = ()
    # Fuente del rendimiento de referencia. None si el rendimiento es un dato del lote.
    yield_reference: str | None = None


@dataclass(frozen=True)
class LotData:
    id: int | None
    name: str
    campaigns: tuple[CampaignData, ...] = ()
    events: tuple[EventData, ...] = field(default_factory=tuple)
    # Declaración del productor sobre el uso del suelo desde 2020 (POST /lots/{id}/land-use/):
    # True si no cambió, False si cambió, None si no declaró. Origen DECLARED.
    land_use_unchanged: bool | None = None

    @property
    def has_observed_events(self) -> bool:
        """Hay bitácora real. Los eventos hipotéticos del simulador no cuentan: con ellos solos
        no se puede inferir la ausencia de otros eventos."""
        return any(not e.hypothetical for e in self.events)

    def find_campaign(self, value: str | int | None) -> CampaignData | None:
        """Campaña por id o etiqueta. Sin valor, la última campaña (por etiqueta)."""
        if value is None or value == '':
            return self.campaigns[-1] if self.campaigns else None
        text = str(value)
        for campaign in self.campaigns:
            if text.isdigit() and campaign.id == int(text):
                return campaign
        for campaign in self.campaigns:
            if campaign.label == text:
                return campaign
        return None


def load_lot_data(lot: Lot) -> LotData:
    """Lee de la base las campañas, insumos y eventos de un lote. Solo lectura."""
    campaigns = tuple(
        CampaignData(
            id=campaign.pk,
            label=campaign.label,
            crop=campaign.crop,
            crop_origin=campaign.crop_origin,
            yield_t_ha=campaign.yield_t_ha,
            yield_origin=campaign.yield_origin,
            inputs=tuple(
                InputData(
                    category=record.category,
                    quantity=record.quantity,
                    unit=record.unit,
                    origin=record.origin,
                    is_simulated=record.is_simulated,
                )
                for record in campaign.inputs.all()
            ),
        )
        for campaign in lot.campaigns.prefetch_related('inputs').order_by('label')
    )
    events = tuple(
        EventData(
            type=event.type,
            date=event.date,
            origin=event.origin,
            is_simulated=event.is_simulated,
            campaign_label=event.campaign.label if event.campaign else None,
        )
        for event in lot.events.select_related('campaign').order_by('date', 'id')
    )
    return LotData(
        id=lot.pk,
        name=lot.name,
        campaigns=campaigns,
        events=events,
        land_use_unchanged=lot.land_use_unchanged,
    )
