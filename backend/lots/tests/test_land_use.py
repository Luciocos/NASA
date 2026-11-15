"""Declaración de uso del suelo desde 2020: POST /api/lots/{id}/land-use/ y la ficha del lote."""

import datetime
import json
from unittest import mock

import pytest
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.test import Client

from core.access import EXAMPLE_READ_ONLY
from lots.models import Lot
from lots.serializers import BODY_NOT_OBJECT, FIELD_NOT_ALLOWED, LAND_USE_INVALID, LAND_USE_MISSING

# Datos armados para la prueba: no representan un lote real.
SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [
            [-61.20, -33.05],
            [-61.19, -33.05],
            [-61.19, -33.04],
            [-61.20, -33.04],
            [-61.20, -33.05],
        ]
    ],
}

# Momentos fijos de las declaraciones, para comparar la fecha exacta
FIRST_AT = datetime.datetime(2026, 11, 15, 13, 30, tzinfo=datetime.UTC)
SECOND_AT = datetime.datetime(2026, 11, 16, 9, 5, 30, tzinfo=datetime.UTC)

# Campos de cada lote en GET /api/lots/ y GET /api/examples/: la declaración no los cambia
LIST_FIELDS = {
    'id',
    'name',
    'renspa',
    'locality',
    'province',
    'geometry',
    'area_ha',
    'event_count',
    'created_at',
    'is_example',
    'owned',
}


@pytest.fixture
def lot(owner: User) -> Lot:
    return Lot.objects.create(name='Lote de prueba', geometry=SQUARE, owner=owner)


@pytest.fixture
def example(db) -> Lot:
    return Lot.objects.create(name='Lote de ejemplo', geometry=SQUARE, public_example=True)


def land_use_url(lot_id: int) -> str:
    return f'/api/lots/{lot_id}/land-use/'


def declare(
    client: Client, lot_id: int, body: object, at: datetime.datetime | None = None
) -> HttpResponse:
    """Manda body como JSON tal cual (un objeto, una lista o null). Con at, fija la hora."""
    payload = json.dumps(body)
    if at is None:
        return client.post(land_use_url(lot_id), payload, content_type='application/json')
    with mock.patch('django.utils.timezone.now', return_value=at):
        return client.post(land_use_url(lot_id), payload, content_type='application/json')


def declared_at(data: dict) -> datetime.datetime:
    """La fecha de una declaración: ISO 8601 con su zona horaria."""
    value = datetime.datetime.fromisoformat(data['declared_at'])
    assert value.utcoffset() is not None
    return value


def assert_undeclared(lot: Lot) -> None:
    lot.refresh_from_db()
    assert lot.land_use_unchanged is None
    assert lot.land_use_declared_at is None


@pytest.mark.django_db
def test_sin_declarar_la_ficha_trae_null(
    owner_client: Client, client: Client, lot: Lot, example: Lot
) -> None:
    own = owner_client.get(f'/api/lots/{lot.pk}/').json()
    public = client.get(f'/api/lots/{example.pk}/').json()
    assert own['land_use_declaration'] is None
    assert public['land_use_declaration'] is None


@pytest.mark.django_db
def test_el_duenio_declara_que_no_cambio_el_uso(owner_client: Client, lot: Lot) -> None:
    response = declare(owner_client, lot.pk, {'unchanged': True}, at=FIRST_AT)
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {'unchanged', 'declared_at', 'origin'}
    assert data['unchanged'] is True
    assert data['origin'] == 'DECLARED'
    assert declared_at(data) == FIRST_AT

    lot.refresh_from_db()
    assert lot.land_use_unchanged is True
    assert lot.land_use_declared_at == FIRST_AT
    detail = owner_client.get(f'/api/lots/{lot.pk}/').json()
    assert detail['land_use_declaration'] == data


@pytest.mark.django_db
def test_el_duenio_declara_que_cambio_el_uso(owner_client: Client, lot: Lot) -> None:
    before = datetime.datetime.now(datetime.UTC)
    response = declare(owner_client, lot.pk, {'unchanged': False})
    after = datetime.datetime.now(datetime.UTC)
    assert response.status_code == 200
    data = response.json()
    assert data['unchanged'] is False
    assert data['origin'] == 'DECLARED'
    assert before <= declared_at(data) <= after

    lot.refresh_from_db()
    assert lot.land_use_unchanged is False
    detail = owner_client.get(f'/api/lots/{lot.pk}/').json()
    assert detail['land_use_declaration'] == data


@pytest.mark.django_db
def test_declarar_otra_vez_pisa_la_anterior_y_su_fecha(owner_client: Client, lot: Lot) -> None:
    first = declare(owner_client, lot.pk, {'unchanged': True}, at=FIRST_AT).json()
    response = declare(owner_client, lot.pk, {'unchanged': False}, at=SECOND_AT)
    assert response.status_code == 200
    second = response.json()
    assert second['unchanged'] is False
    assert second['origin'] == 'DECLARED'
    assert declared_at(second) == SECOND_AT
    assert second['declared_at'] != first['declared_at']

    detail = owner_client.get(f'/api/lots/{lot.pk}/').json()
    assert detail['land_use_declaration'] == second


@pytest.mark.django_db
def test_declarar_exige_token(client: Client, lot: Lot, example: Lot) -> None:
    assert declare(client, lot.pk, {'unchanged': True}).status_code == 401
    assert declare(client, example.pk, {'unchanged': True}).status_code == 401
    assert_undeclared(lot)


@pytest.mark.django_db
@pytest.mark.parametrize('body', [{'unchanged': True}, {'unchanged': False}, {}])
def test_ejemplo_publico_da_403_con_el_mensaje(
    owner_client: Client, example: Lot, body: dict
) -> None:
    response = declare(owner_client, example.pk, body)
    assert response.status_code == 403
    assert response.json() == {'detail': EXAMPLE_READ_ONLY}
    assert_undeclared(example)


@pytest.mark.django_db
def test_lote_ajeno_da_el_mismo_404_que_uno_inexistente(stranger_client: Client, lot: Lot) -> None:
    foreign = declare(stranger_client, lot.pk, {'unchanged': False})
    missing = declare(stranger_client, 999999, {'unchanged': False})
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert_undeclared(lot)


@pytest.mark.django_db
def test_lote_inexistente_da_404(owner_client: Client) -> None:
    assert declare(owner_client, 999999, {'unchanged': True}).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('body', 'errors'),
    [
        ({}, {'unchanged': [LAND_USE_MISSING]}),
        ({'unchanged': None}, {'unchanged': [LAND_USE_MISSING]}),
        ({'unchanged': 'true'}, {'unchanged': [LAND_USE_INVALID]}),
        ({'unchanged': 'sí'}, {'unchanged': [LAND_USE_INVALID]}),
        ({'unchanged': 1}, {'unchanged': [LAND_USE_INVALID]}),
        ({'unchanged': 0}, {'unchanged': [LAND_USE_INVALID]}),
        ({'unchanged': [True]}, {'unchanged': [LAND_USE_INVALID]}),
        ({'unchanged': True, 'origin': 'VERIFIED'}, {'origin': [FIELD_NOT_ALLOWED]}),
        ([True], {'non_field_errors': [BODY_NOT_OBJECT]}),
        (True, {'non_field_errors': [BODY_NOT_OBJECT]}),
        (None, {'non_field_errors': [BODY_NOT_OBJECT]}),
    ],
    ids=[
        'sin_unchanged',
        'unchanged_null',
        'texto_true',
        'texto_si',
        'uno',
        'cero',
        'lista',
        'campo_de_mas',
        'cuerpo_lista',
        'cuerpo_true',
        'cuerpo_null',
    ],
)
def test_cuerpo_invalido_da_400_con_el_error_por_campo(
    owner_client: Client, lot: Lot, body: object, errors: dict
) -> None:
    response = declare(owner_client, lot.pk, body)
    assert response.status_code == 400
    assert response.json() == errors
    assert_undeclared(lot)


@pytest.mark.django_db
@pytest.mark.parametrize(
    'raw',
    ['{"unchanged":', "{'unchanged': true}", '{"unchanged": NaN}'],
    ids=['cortado', 'comillas_simples', 'nan'],
)
def test_json_mal_formado_da_400_con_el_error_en_espaniol(
    owner_client: Client, lot: Lot, raw: str
) -> None:
    # A un JSON roto DRF responde {"detail": "JSON parse error - ..."}, con el texto del parser
    response = owner_client.post(land_use_url(lot.pk), raw, content_type='application/json')
    assert response.status_code == 400
    assert response.json() == {'non_field_errors': [BODY_NOT_OBJECT]}
    assert_undeclared(lot)


@pytest.mark.django_db
def test_json_mal_formado_no_saltea_el_403_ni_el_404(
    owner_client: Client, stranger_client: Client, lot: Lot, example: Lot
) -> None:
    raw = '{"unchanged":'
    on_example = owner_client.post(land_use_url(example.pk), raw, content_type='application/json')
    foreign = stranger_client.post(land_use_url(lot.pk), raw, content_type='application/json')
    missing = stranger_client.post(land_use_url(999999), raw, content_type='application/json')
    assert on_example.status_code == 403
    assert on_example.json() == {'detail': EXAMPLE_READ_ONLY}
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert_undeclared(lot)


@pytest.mark.django_db
def test_un_formulario_sin_unchanged_no_se_toma_como_false(owner_client: Client, lot: Lot) -> None:
    # BooleanField de DRF toma como false un campo que no vino en un formulario
    empty_form = owner_client.post(land_use_url(lot.pk))
    assert empty_form.status_code == 400
    assert empty_form.json() == {'unchanged': [LAND_USE_MISSING]}
    text_form = owner_client.post(land_use_url(lot.pk), {'unchanged': 'false'})
    assert text_form.status_code == 400
    assert text_form.json() == {'unchanged': [LAND_USE_INVALID]}
    assert_undeclared(lot)


@pytest.mark.django_db
def test_la_lista_de_lotes_no_cambia(owner_client: Client, lot: Lot, example: Lot) -> None:
    assert declare(owner_client, lot.pk, {'unchanged': True}).status_code == 200
    [own] = owner_client.get('/api/lots/').json()
    [public] = owner_client.get('/api/examples/').json()
    assert set(own) == LIST_FIELDS
    assert set(public) == LIST_FIELDS


@pytest.mark.django_db
def test_el_alta_de_lote_no_acepta_una_declaracion(owner_client: Client) -> None:
    response = owner_client.post(
        '/api/lots/',
        {
            'name': 'Lote nuevo',
            'geometry': SQUARE,
            'land_use_unchanged': True,
            'land_use_declared_at': '2026-11-15T10:30:00-03:00',
            'land_use_declaration': {
                'unchanged': True,
                'declared_at': '2026-11-15T10:30:00-03:00',
                'origin': 'DECLARED',
            },
        },
        content_type='application/json',
    )
    assert response.status_code == 201
    assert response.json()['land_use_declaration'] is None
    assert_undeclared(Lot.objects.get(pk=response.json()['id']))
