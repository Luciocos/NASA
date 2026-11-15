import datetime
import uuid

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from core.access import EXAMPLE_READ_ONLY
from events.models import Event
from lots.models import Campaign, Lot
from passports.models import Passport

# Datos armados para la prueba: no representan un lote real.
SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [[-61.20, -33.05], [-61.19, -33.05], [-61.19, -33.04], [-61.20, -33.04], [-61.20, -33.05]]
    ],
}


@pytest.fixture
def lot(owner: User) -> Lot:
    lot = Lot.objects.create(
        name='Lote de prueba', locality='Casilda', geometry=SQUARE, owner=owner
    )
    campaign = Campaign.objects.create(lot=lot, label='2025/26', crop='SOY', crop_origin='DECLARED')
    Event.objects.create(
        lot=lot,
        campaign=campaign,
        type='COVER_CROP',
        date=datetime.date(2025, 6, 15),
        sensor='MANUAL',
        origin='DECLARED',
        is_simulated=True,
    )
    return lot


@pytest.mark.django_db
def test_genera_pasaporte_con_ruta_publica(owner_client: Client, lot: Lot) -> None:
    response = owner_client.post(f'/api/lots/{lot.pk}/passport/')
    assert response.status_code == 201
    data = response.json()
    passport = Passport.objects.get()
    assert data['token'] == str(passport.token)
    assert data['url'] == f'/pasaporte/{passport.token}'
    assert data['expires_at'] is None


@pytest.mark.django_db
def test_genera_pasaporte_con_vencimiento(owner_client: Client, lot: Lot) -> None:
    response = owner_client.post(
        f'/api/lots/{lot.pk}/passport/', {'expires_in_days': 30}, content_type='application/json'
    )
    assert response.status_code == 201
    assert Passport.objects.get().expires_at > timezone.now() + datetime.timedelta(days=29)


@pytest.mark.django_db
def test_vencimiento_invalido_400(owner_client: Client, lot: Lot) -> None:
    response = owner_client.post(
        f'/api/lots/{lot.pk}/passport/', {'expires_in_days': 0}, content_type='application/json'
    )
    assert response.status_code == 400
    assert not Passport.objects.exists()


@pytest.mark.django_db
def test_pasaporte_de_lote_inexistente_404(owner_client: Client) -> None:
    assert owner_client.post('/api/lots/999999/passport/').status_code == 404


@pytest.mark.django_db
def test_vista_publica(client: Client, lot: Lot) -> None:
    passport = Passport.objects.create(lot=lot)
    response = client.get(f'/api/passports/{passport.token}/')
    assert response.status_code == 200
    data = response.json()
    assert data['lot']['name'] == 'Lote de prueba'
    assert data['lot']['event_count'] == 1
    # El enlace es público, pero no muestra quién es el dueño
    assert data['lot']['owned'] is False
    assert data['lot']['is_example'] is False
    assert 'owner' not in data['lot']
    assert 'ana@example.com' not in str(data)
    assert [c['label'] for c in data['lot']['campaigns']] == ['2025/26']
    [event] = data['events']
    assert event['type_label'] == 'Cultivo de cobertura'
    assert event['is_simulated'] is True
    assert data['footprint']['total_kg_co2e_per_t'] is None
    assert data['score']['score'] is None
    assert data['uses_simulated_data'] is True
    assert data['generated_at']
    assert data['data_notice'] == 'Usa datos abiertos de la NASA.'
    assert 'Prueba de concepto' in data['disclaimer']
    assert 'certific' not in str(data).lower()


@pytest.mark.django_db
def test_token_inexistente_404(client: Client) -> None:
    assert client.get(f'/api/passports/{uuid.uuid4()}/').status_code == 404


@pytest.mark.django_db
def test_pasaporte_vencido_410(client: Client, lot: Lot) -> None:
    passport = Passport.objects.create(
        lot=lot, expires_at=timezone.now() - datetime.timedelta(minutes=1)
    )
    response = client.get(f'/api/passports/{passport.token}/')
    assert response.status_code == 410
    assert 'venció' in response.json()['detail']


@pytest.mark.django_db
def test_pasaporte_vigente_con_vencimiento_futuro(client: Client, lot: Lot) -> None:
    passport = Passport.objects.create(
        lot=lot, expires_at=timezone.now() + datetime.timedelta(days=1)
    )
    assert client.get(f'/api/passports/{passport.token}/').status_code == 200


@pytest.mark.django_db
def test_solo_el_duenio_genera_el_pasaporte(
    client: Client, stranger_client: Client, lot: Lot
) -> None:
    foreign = stranger_client.post(f'/api/lots/{lot.pk}/passport/')
    assert foreign.status_code == 404
    assert foreign.json() == stranger_client.post('/api/lots/999999/passport/').json()
    assert client.post(f'/api/lots/{lot.pk}/passport/').status_code == 401
    assert not Passport.objects.exists()


@pytest.mark.django_db
def test_pasaporte_de_un_ejemplo_da_403(owner_client: Client) -> None:
    example = Lot.objects.create(name='Lote de ejemplo', geometry=SQUARE, public_example=True)
    response = owner_client.post(f'/api/lots/{example.pk}/passport/')
    assert response.status_code == 403
    assert response.json() == {'detail': EXAMPLE_READ_ONLY}
    assert not Passport.objects.exists()
