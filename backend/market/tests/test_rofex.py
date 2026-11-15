import datetime

import pytest
from rest_framework.test import APIClient

from market import rofex
from market.rofex import (
    MarketUnavailable,
    SuggestedPrice,
    UnsupportedCrop,
    harvest_symbol,
    parse_market_data,
)


def test_contrato_de_cosecha_de_la_campania():
    assert harvest_symbol('SOY', '2026/27') == 'SOJ.ROS/MAY27'
    assert harvest_symbol('SOY', None, datetime.date(2026, 11, 15)) == 'SOJ.ROS/MAY27'
    assert harvest_symbol('SOY', None, datetime.date(2027, 3, 1)) == 'SOJ.ROS/MAY27'
    with pytest.raises(UnsupportedCrop):
        harvest_symbol('CORN', '2026/27')
    with pytest.raises(ValueError):
        harvest_symbol('SOY', '26-27')


def test_prefiere_el_ajuste_y_si_no_el_ultimo_operado():
    stamp = int(datetime.datetime(2026, 11, 13, 18, tzinfo=datetime.UTC).timestamp() * 1000)
    both = {
        'status': 'OK',
        'marketData': {
            'SE': {'price': 301.5, 'date': stamp},
            'LA': {'price': 303.0, 'size': 10, 'date': stamp},
        },
    }
    assert parse_market_data(both) == (301.5, 'settlement', '2026-11-13')
    only_last = {'status': 'OK', 'marketData': {'SE': None, 'LA': {'price': 303.0}}}
    assert parse_market_data(only_last) == (303.0, 'last', None)
    assert parse_market_data({'status': 'OK', 'marketData': {'SE': None, 'LA': None}}) is None
    assert parse_market_data({'status': 'ERROR', 'description': 'x'}) is None


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv('ROFEX_USER', 'prueba')
    monkeypatch.setenv('ROFEX_PASSWORD', 'prueba')
    monkeypatch.setenv('ROFEX_ENVIRONMENT', 'REMARKET')
    rofex.cache.clear()


@pytest.mark.django_db
def test_sin_credenciales_responde_503(monkeypatch):
    for name in ('ROFEX_USER', 'ROFEX_PASSWORD', 'ROFEX_ENVIRONMENT'):
        monkeypatch.delenv(name, raising=False)
    response = APIClient().get('/api/market/suggested-price/?crop=SOY&campaign=2026/27')
    assert response.status_code == 503
    assert 'no tiene configurada la conexión' in response.json()['detail']


@pytest.mark.django_db
def test_devuelve_el_precio_y_marca_el_entorno_de_prueba(configured, monkeypatch):
    calls = []

    def fake_query(symbol):
        calls.append(symbol)
        return SuggestedPrice(
            symbol=symbol,
            price_usd_t=301.5,
            kind='settlement',
            date='2026-11-13',
            environment='REMARKET',
            simulated_market=True,
        )

    monkeypatch.setattr(rofex, '_query', fake_query)
    client = APIClient()
    body = client.get('/api/market/suggested-price/?crop=SOY&campaign=2026/27').json()
    assert body['symbol'] == 'SOJ.ROS/MAY27'
    assert body['price_usd_t'] == 301.5
    assert body['simulated_market'] is True
    assert 'sugerido' in body['disclaimer']
    # el segundo pedido sale de la caché
    client.get('/api/market/suggested-price/?crop=SOY&campaign=2026/27')
    assert calls == ['SOJ.ROS/MAY27']


@pytest.mark.django_db
def test_error_de_rofex_responde_502_y_cultivo_sin_contrato_400(configured, monkeypatch):
    def failing(symbol):
        raise MarketUnavailable('Rofex no devolvió precio para ' + symbol)

    monkeypatch.setattr(rofex, '_query', failing)
    client = APIClient()
    assert client.get('/api/market/suggested-price/?crop=SOY').status_code == 502
    assert client.get('/api/market/suggested-price/?crop=CORN').status_code == 400
