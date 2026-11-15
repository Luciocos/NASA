"""Precio sugerido de mercado desde Matba Rofex, con la librería pyRofex.

Es un precio sugerido: el productor lo puede cambiar. No es un dato satelital ni del lote.

Credenciales (solo en .env, nunca en el repositorio):
    ROFEX_USER, ROFEX_PASSWORD, ROFEX_ACCOUNT (opcional)
    ROFEX_ENVIRONMENT: LIVE (mercado real, cuenta de un agente) o REMARKET (entorno de prueba
    reMarkets: sus precios son simulados y la respuesta lo marca).

Contrato: futuro de soja Rosario en la posición mayo del segundo año de la campaña
(campaña 2026/27 -> SOJ.ROS/MAY27), la de cosecha. Se toma el precio de ajuste; si no hay, el
último operado y, si tampoco, el de cierre.
"""

from __future__ import annotations

import datetime
import os
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import asdict, dataclass
from typing import Any

from django.core.cache import cache

SOURCE = 'Matba Rofex (A3 Mercados), API de Primary vía pyRofex'
CROP_PREFIX = {'SOY': 'SOJ.ROS'}
MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
CAMPAIGN_LABEL = re.compile(r'^(\d{4})/(\d{2})$')
CACHE_SECONDS = 10 * 60
TIMEOUT_SECONDS = 10
# Orden de preferencia de las entradas de market data
ENTRY_KINDS = [('SE', 'settlement'), ('LA', 'last'), ('CL', 'close')]


class NotConfigured(Exception):
    """Faltan credenciales de Rofex en el entorno."""


class MarketUnavailable(Exception):
    """La API respondió con error, sin precio o no respondió a tiempo."""


class UnsupportedCrop(ValueError):
    """Cultivo sin contrato configurado."""


@dataclass
class SuggestedPrice:
    symbol: str
    price_usd_t: float
    kind: str  # settlement | last | close
    date: str | None  # fecha del dato, AAAA-MM-DD
    environment: str  # LIVE | REMARKET
    simulated_market: bool  # True en reMarkets: no es un precio real
    source: str = SOURCE

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def harvest_symbol(crop: str, campaign: str | None, today: datetime.date | None = None) -> str:
    """Contrato de cosecha de la campaña. Sin campaña, la próxima posición mayo."""
    prefix = CROP_PREFIX.get(crop)
    if prefix is None:
        raise UnsupportedCrop(f'Por ahora solo hay precio sugerido para soja (no para {crop}).')
    if campaign:
        match = CAMPAIGN_LABEL.match(campaign)
        if not match:
            raise ValueError('La campaña va con el formato AAAA/AA, por ejemplo 2026/27.')
        year = int(match.group(2))
    else:
        today = today or datetime.date.today()
        year = (today.year if today.month <= 5 else today.year + 1) % 100
    return f'{prefix}/{MONTHS[4]}{year:02d}'


def credentials() -> tuple[str, str, str, str]:
    user = os.environ.get('ROFEX_USER', '').strip()
    password = os.environ.get('ROFEX_PASSWORD', '')
    environment = os.environ.get('ROFEX_ENVIRONMENT', '').strip().upper()
    if not user or not password or environment not in {'LIVE', 'REMARKET'}:
        # Para el equipo: faltan ROFEX_USER, ROFEX_PASSWORD o ROFEX_ENVIRONMENT (ver .env.example)
        raise NotConfigured(
            'El precio sugerido de Rofex todavía no está disponible: el servidor no tiene '
            'configurada la conexión con Matba Rofex. Podés cargar el precio a mano.'
        )
    return user, password, os.environ.get('ROFEX_ACCOUNT', '').strip(), environment


def parse_market_data(response: dict[str, Any]) -> tuple[float, str, str | None] | None:
    """Precio, tipo y fecha de la primera entrada con precio (ajuste, último o cierre)."""
    if not isinstance(response, dict) or response.get('status') != 'OK':
        return None
    data = response.get('marketData') or {}
    for key, kind in ENTRY_KINDS:
        entry = data.get(key)
        # LA y SE vienen como objeto; CL a veces también
        if isinstance(entry, dict) and isinstance(entry.get('price'), int | float):
            stamp = entry.get('date')
            date = (
                datetime.datetime.fromtimestamp(stamp / 1000, tz=datetime.UTC).date().isoformat()
                if isinstance(stamp, int | float)
                else None
            )
            return float(entry['price']), kind, date
    return None


def _query(symbol: str) -> SuggestedPrice:
    import pyRofex  # se importa acá: solo hace falta si hay credenciales

    user, password, account, env_name = credentials()
    environment = pyRofex.Environment[env_name]
    try:
        pyRofex.initialize(user=user, password=password, account=account, environment=environment)
        response = pyRofex.get_market_data(
            ticker=symbol,
            entries=[
                pyRofex.MarketDataEntry.SETTLEMENT_PRICE,
                pyRofex.MarketDataEntry.LAST,
                pyRofex.MarketDataEntry.CLOSING_PRICE,
            ],
            environment=environment,
        )
    except Exception as exc:  # pyRofex lanza ApiException y errores de requests
        raise MarketUnavailable(f'Rofex no respondió bien: {exc}') from exc
    parsed = parse_market_data(response)
    if parsed is None:
        raise MarketUnavailable(f'Rofex no devolvió precio para {symbol}.')
    price, kind, date = parsed
    return SuggestedPrice(
        symbol=symbol,
        price_usd_t=price,
        kind=kind,
        date=date,
        environment=env_name,
        simulated_market=env_name == 'REMARKET',
    )


_executor = ThreadPoolExecutor(max_workers=2)


def suggested_price(symbol: str) -> SuggestedPrice:
    """Precio del contrato, con caché de 10 minutos y tiempo máximo de espera.

    pyRofex no pone tiempo límite a sus pedidos: se corre en un hilo para no colgar al servidor.
    """
    credentials()  # falla rápido si no está configurado
    key = f'rofex:{symbol}'
    cached = cache.get(key)
    if cached:
        return SuggestedPrice(**cached)
    future = _executor.submit(_query, symbol)
    try:
        result = future.result(timeout=TIMEOUT_SECONDS)
    except FutureTimeout as exc:
        raise MarketUnavailable('Rofex tardó demasiado en responder.') from exc
    cache.set(key, result.to_dict(), CACHE_SECONDS)
    return result
