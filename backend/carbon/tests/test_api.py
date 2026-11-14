"""Pruebas de la API de huella, puntaje y simulador, contra la base de pruebas.

Usan los factors.yaml y score_config.yaml reales (hoy todos nulos), salvo donde se
inyectan factores ficticios con monkeypatch.
"""

import datetime

import pytest
from django.test import Client

from carbon import views
from carbon.models import InputRecord
from events.models import Event
from lots.models import Campaign, Lot

SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [[-61.20, -33.05], [-61.19, -33.05], [-61.19, -33.04], [-61.20, -33.04], [-61.20, -33.05]]
    ],
}


@pytest.fixture
def lot() -> Lot:
    lot = Lot.objects.create(name='Lote de prueba', geometry=SQUARE)
    Campaign.objects.create(lot=lot, label='2024/25', crop='CORN', crop_origin='VERIFIED')
    Campaign.objects.create(lot=lot, label='2025/26', crop='SOY', crop_origin='DECLARED')
    Event.objects.create(
        lot=lot,
        type='SOWING',
        date=datetime.date(2025, 11, 5),
        sensor='MANUAL',
        origin='DECLARED',
        is_simulated=True,
    )
    return lot


@pytest.mark.django_db
def test_huella_sin_factores_responde_sin_dato(client: Client, lot: Lot) -> None:
    response = client.get(f'/api/lots/{lot.pk}/footprint/')
    assert response.status_code == 200
    data = response.json()
    assert data['campaign']['label'] == '2025/26'
    assert data['total_kg_co2e_per_t'] is None
    assert data['complete'] is False
    assert len(data['components']) == 7
    assert data['message'].startswith('No se puede calcular todavía')
    assert data['uses_simulated_data'] is True
    assert [c['label'] for c in data['available_campaigns']] == ['2024/25', '2025/26']


@pytest.mark.django_db
def test_huella_por_etiqueta_o_id(client: Client, lot: Lot) -> None:
    older = lot.campaigns.get(label='2024/25')
    by_label = client.get(f'/api/lots/{lot.pk}/footprint/', {'campaign': '2024/25'}).json()
    by_id = client.get(f'/api/lots/{lot.pk}/footprint/', {'campaign': older.pk}).json()
    assert by_label['campaign']['id'] == by_id['campaign']['id'] == older.pk


@pytest.mark.django_db
def test_huella_campania_inexistente_404(client: Client, lot: Lot) -> None:
    response = client.get(f'/api/lots/{lot.pk}/footprint/', {'campaign': '1999/00'})
    assert response.status_code == 404


@pytest.mark.django_db
def test_lote_inexistente_404(client: Client) -> None:
    assert client.get('/api/lots/999999/footprint/').status_code == 404
    assert client.get('/api/lots/999999/score/').status_code == 404
    assert client.post('/api/lots/999999/simulate/', {}, 'application/json').status_code == 404


@pytest.mark.django_db
def test_huella_con_factores_inyectados(
    client: Client, lot: Lot, fake_factors, monkeypatch
) -> None:
    monkeypatch.setattr(views, 'load_factors', lambda: fake_factors)
    campaign = lot.campaigns.get(label='2025/26')
    campaign.yield_t_ha = 4.0
    campaign.yield_origin = 'DECLARED'
    campaign.save()
    # Cantidades ficticias, una por categoría.
    for category, quantity, unit in [
        ('FERTILIZER_N', 10.0, 'kg/ha'),
        ('FERTILIZER_P', 20.0, 'kg/ha'),
        ('DIESEL', 4.0, 'l/ha'),
        ('PESTICIDE', 2.0, 'kg/ha'),
        ('SEED', 60.0, 'kg/ha'),
    ]:
        InputRecord.objects.create(
            campaign=campaign, category=category, quantity=quantity, unit=unit, origin='DECLARED'
        )
    data = client.get(f'/api/lots/{lot.pk}/footprint/').json()
    assert data['complete'] is True
    assert data['total_kg_co2e_per_t'] == pytest.approx(150 / 4)


@pytest.mark.django_db
def test_puntaje_con_pesos_nulos(client: Client, lot: Lot) -> None:
    data = client.get(f'/api/lots/{lot.pk}/score/').json()
    assert data['score'] is None
    assert 'pesos pendientes de definir por el equipo' in data['message']
    assert {c['key']: c['status'] for c in data['criteria']}['rotation'] == 'cumple'


@pytest.mark.django_db
def test_simulador_no_persiste_nada(client: Client, lot: Lot) -> None:
    counts = (Event.objects.count(), InputRecord.objects.count(), Campaign.objects.count())
    response = client.post(
        f'/api/lots/{lot.pk}/simulate/', {'cover_crop': True}, content_type='application/json'
    )
    assert response.status_code == 200
    data = response.json()
    assert data['persisted'] is False
    assert data['message'] == 'Simulación: no modifica los datos del lote.'
    assert data['changed_criteria'][0]['key'] == 'winter_cover'
    assert data['after']['footprint']['total_kg_co2e_per_t'] is None
    assert counts == (Event.objects.count(), InputRecord.objects.count(), Campaign.objects.count())
    assert not Event.objects.filter(type='COVER_CROP').exists()


@pytest.mark.django_db
def test_simulador_cuerpo_invalido_400(client: Client, lot: Lot) -> None:
    response = client.post(
        f'/api/lots/{lot.pk}/simulate/', {'cover_crop': 'si'}, content_type='application/json'
    )
    assert response.status_code == 400
    assert 'cover_crop' in response.json()
