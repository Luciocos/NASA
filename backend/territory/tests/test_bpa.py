"""Chequeo 'bpa' y POST /api/lots/{id}/bpa/."""

import datetime
import json

import pytest
from django.contrib.auth.models import User
from django.test import Client

from core.access import EXAMPLE_READ_ONLY
from lots.models import Lot
from territory.checks import bpa
from territory.models import BpaDeclaration
from territory.result import CheckOrigin, CheckStatus

# Datos armados para la prueba: no representan un lote real.
SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [[-61.2, -33.0], [-61.19, -33.0], [-61.19, -33.01], [-61.2, -33.01], [-61.2, -33.0]]
    ],
}
AT = datetime.datetime(2026, 11, 15, 12, 0, tzinfo=datetime.UTC)


@pytest.fixture
def lot(owner: User) -> Lot:
    return Lot.objects.create(name='Lote de prueba', geometry=SQUARE, owner=owner)


@pytest.fixture
def example(db) -> Lot:
    return Lot.objects.create(name='Lote de ejemplo', geometry=SQUARE, public_example=True)


def post(client: Client, lot_id: int, body: object):
    return client.post(
        f'/api/lots/{lot_id}/bpa/', json.dumps(body), content_type='application/json'
    )


# --- Chequeo ---


def test_sin_declaracion_da_no_data(lot: Lot) -> None:
    result = bpa.run(lot)
    assert result.status == CheckStatus.NO_DATA
    assert result.origin == CheckOrigin.DECLARED
    assert 'no declaró' in result.summary
    assert result.details == {}


def test_adhiere_da_clear_y_aclara_que_es_declarado(lot: Lot) -> None:
    BpaDeclaration.objects.create(
        lot=lot, adheres=True, registration_number='123', program='BPA Santa Fe', declared_at=AT
    )
    result = bpa.run(Lot.objects.get(pk=lot.pk))
    assert result.status == CheckStatus.CLEAR
    assert result.origin == CheckOrigin.DECLARED
    assert 'declarado' in result.summary
    assert 'no se verificó' in result.summary
    assert result.details == {
        'adheres': True,
        'registration_number': '123',
        'program': 'BPA Santa Fe',
        'declared_at': AT.isoformat(),
    }


def test_no_adhiere_da_posible_conflicto(lot: Lot) -> None:
    BpaDeclaration.objects.create(lot=lot, adheres=False, declared_at=AT)
    result = bpa.run(Lot.objects.get(pk=lot.pk))
    assert result.status == CheckStatus.POSSIBLE_CONFLICT
    assert 'declaró no estar adherido' in result.summary
    assert result.details['adheres'] is False


def test_el_texto_no_habla_de_certificacion(lot: Lot) -> None:
    for adheres in (True, False):
        BpaDeclaration.objects.update_or_create(
            lot=lot, defaults={'adheres': adheres, 'declared_at': AT}
        )
        summary = bpa.run(Lot.objects.get(pk=lot.pk)).summary.lower()
        assert 'certific' not in summary


# --- Endpoint ---


def test_el_duenio_declara_que_adhiere(owner_client: Client, lot: Lot) -> None:
    response = post(owner_client, lot.pk, {'adheres': True, 'registration_number': ' 4567 '})
    assert response.status_code == 200
    body = response.json()
    assert body['key'] == 'bpa'
    assert body['status'] == 'CLEAR'
    assert body['origin'] == 'DECLARED'
    assert body['details']['registration_number'] == '4567'
    assert BpaDeclaration.objects.get(lot=lot).adheres is True


def test_declarar_otra_vez_pisa_la_anterior(owner_client: Client, lot: Lot) -> None:
    post(owner_client, lot.pk, {'adheres': True, 'registration_number': '4567'})
    response = post(owner_client, lot.pk, {'adheres': False, 'registration_number': '4567'})
    assert response.status_code == 200
    assert response.json()['status'] == 'POSSIBLE_CONFLICT'
    declaration = BpaDeclaration.objects.get(lot=lot)
    assert declaration.adheres is False
    assert declaration.registration_number == ''


def test_null_borra_la_declaracion(owner_client: Client, lot: Lot) -> None:
    post(owner_client, lot.pk, {'adheres': True})
    response = post(owner_client, lot.pk, {'adheres': None})
    assert response.status_code == 200
    assert response.json()['status'] == 'NO_DATA'
    assert not BpaDeclaration.objects.filter(lot=lot).exists()


def test_el_panel_de_chequeos_refleja_la_declaracion(owner_client: Client, lot: Lot) -> None:
    post(owner_client, lot.pk, {'adheres': True})
    checks = owner_client.get(f'/api/lots/{lot.pk}/territorial-checks/').json()['checks']
    assert next(c for c in checks if c['key'] == 'bpa')['status'] == 'CLEAR'


def test_sin_token_da_401(client: Client, lot: Lot) -> None:
    assert post(client, lot.pk, {'adheres': True}).status_code == 401


def test_ejemplo_publico_da_403(owner_client: Client, example: Lot) -> None:
    response = post(owner_client, example.pk, {'adheres': True})
    assert response.status_code == 403
    assert response.json()['detail'] == EXAMPLE_READ_ONLY
    assert not BpaDeclaration.objects.exists()


def test_lote_ajeno_da_404(stranger_client: Client, lot: Lot) -> None:
    assert post(stranger_client, lot.pk, {'adheres': True}).status_code == 404
    assert post(stranger_client, 999999, {'adheres': True}).status_code == 404
    assert not BpaDeclaration.objects.exists()


@pytest.mark.parametrize('body', [{}, {'adheres': 'tal vez'}, [True], 'si'])
def test_cuerpo_invalido_da_400(owner_client: Client, lot: Lot, body: object) -> None:
    assert post(owner_client, lot.pk, body).status_code == 400
    assert not BpaDeclaration.objects.exists()
