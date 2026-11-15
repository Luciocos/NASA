import datetime

import pytest
from django.contrib.auth.models import User
from django.test import Client

from core.access import EXAMPLE_READ_ONLY
from events.models import Event
from events.views import EMPTY_LOG_MESSAGE, NO_MATCH_MESSAGE
from lots.models import Campaign, Lot

# Datos armados para la prueba: no representan observaciones reales.
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


@pytest.fixture
def lot(owner: User) -> Lot:
    return Lot.objects.create(name='Lote de prueba', geometry=SQUARE, owner=owner)


@pytest.fixture
def example_event(db) -> Event:
    example = Lot.objects.create(name='Lote de ejemplo', geometry=SQUARE, public_example=True)
    return Event.objects.create(
        lot=example,
        type='SOWING',
        date=datetime.date(2025, 11, 5),
        sensor='MANUAL',
        origin='ESTIMATED',
        is_simulated=True,
    )


@pytest.fixture
def campaigns(lot: Lot) -> dict[str, Campaign]:
    return {
        label: Campaign.objects.create(lot=lot, label=label, crop='SOY', crop_origin='DECLARED')
        for label in ('2024/25', '2025/26')
    }


@pytest.fixture
def events(lot: Lot, campaigns: dict[str, Campaign]) -> list[Event]:
    return [
        Event.objects.create(
            lot=lot,
            campaign=campaigns['2025/26'],
            type='TILLAGE',
            date=datetime.date(2026, 10, 12),
            date_uncertainty_days=12,
            sensor='NISAR',
            origin='VERIFIED',
            confidence=0.7,
            evidence_image='evidence/prueba_nisar.png',
            evidence_optical_image='evidence/prueba_hls.png',
            is_simulated=True,
        ),
        Event.objects.create(
            lot=lot,
            campaign=campaigns['2024/25'],
            type='HARVEST',
            date=datetime.date(2025, 4, 10),
            sensor='MANUAL',
            origin='ESTIMATED',
            is_simulated=True,
        ),
    ]


def events_url(lot: Lot, query: str = '') -> str:
    return f'/api/lots/{lot.pk}/events/{query}'


@pytest.mark.django_db
def test_bitacora_ordenada_por_fecha_con_etiquetas_y_urls(
    owner_client: Client, lot: Lot, events: list[Event]
) -> None:
    response = owner_client.get(events_url(lot))
    assert response.status_code == 200
    data = response.json()
    assert data['lot'] == lot.pk
    assert data['count'] == 2
    assert data['message'] is None
    harvest, tillage = data['events']
    assert harvest['type'] == 'HARVEST'
    assert harvest['evidence_image_url'] is None
    assert harvest['campaign_label'] == '2024/25'
    assert tillage['type_label'] == 'Remoción de suelo'
    assert tillage['sensor_label'] == 'NISAR'
    assert tillage['date'] == '2026-10-12'
    assert tillage['evidence_image_url'] == '/media/evidence/prueba_nisar.png'
    assert tillage['evidence_optical_image_url'] == '/media/evidence/prueba_hls.png'
    assert tillage['is_simulated'] is True


@pytest.mark.django_db
def test_lote_sin_eventos_devuelve_lista_vacia_con_mensaje(owner_client: Client, lot: Lot) -> None:
    response = owner_client.get(events_url(lot))
    assert response.status_code == 200
    assert response.json() == {
        'lot': lot.pk,
        'count': 0,
        'message': EMPTY_LOG_MESSAGE,
        'events': [],
    }
    assert not Event.objects.exists()


@pytest.mark.django_db
def test_lote_inexistente_da_404(owner_client: Client) -> None:
    assert owner_client.get('/api/lots/999999/events/').status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('query', 'expected_types'),
    [
        ('?type=TILLAGE', ['TILLAGE']),
        ('?sensor=MANUAL', ['HARVEST']),
        ('?campaign=2024/25', ['HARVEST']),
        ('?campaign=2025/26&sensor=NISAR', ['TILLAGE']),
    ],
)
def test_filtros(
    owner_client: Client, lot: Lot, events: list[Event], query: str, expected_types: list[str]
) -> None:
    data = owner_client.get(events_url(lot, query)).json()
    assert [event['type'] for event in data['events']] == expected_types


@pytest.mark.django_db
def test_filtro_por_id_de_campania(
    owner_client: Client, lot: Lot, campaigns: dict[str, Campaign], events: list[Event]
) -> None:
    data = owner_client.get(events_url(lot, f'?campaign={campaigns["2025/26"].pk}')).json()
    assert [event['type'] for event in data['events']] == ['TILLAGE']


@pytest.mark.django_db
def test_filtro_sin_coincidencias_explica_el_motivo(
    owner_client: Client, lot: Lot, events: list[Event]
) -> None:
    data = owner_client.get(events_url(lot, '?type=BURN')).json()
    assert data['events'] == []
    assert data['message'] == NO_MATCH_MESSAGE


@pytest.mark.django_db
def test_filtro_invalido_da_400(owner_client: Client, lot: Lot, events: list[Event]) -> None:
    response = owner_client.get(events_url(lot, '?type=RAIN&sensor=RADAR'))
    assert response.status_code == 400
    assert set(response.json()) == {'type', 'sensor'}


def patch(client: Client, event: Event, body: dict) -> dict:
    response = client.patch(f'/api/events/{event.pk}/', body, content_type='application/json')
    return {'status': response.status_code, 'data': response.json()}


@pytest.mark.django_db
def test_correccion_pasa_a_declarado_y_conserva_la_deteccion(
    owner_client: Client, events: list[Event]
) -> None:
    tillage = events[0]
    result = patch(owner_client, tillage, {'date': '2026-10-20', 'notes': 'Fue una semana después'})
    assert result['status'] == 200
    data = result['data']
    assert data['date'] == '2026-10-20'
    assert data['origin'] == 'DECLARED'
    assert data['sensor'] == 'NISAR'
    assert data['confidence'] == 0.7
    assert data['is_simulated'] is True
    tillage.refresh_from_db()
    assert tillage.origin == 'DECLARED'
    assert tillage.notes == 'Fue una semana después'


@pytest.mark.django_db
def test_confirmar_estimado_pasa_a_declarado(owner_client: Client, events: list[Event]) -> None:
    result = patch(owner_client, events[1], {'confirm': True})
    assert result['status'] == 200
    assert result['data']['origin'] == 'DECLARED'


@pytest.mark.django_db
def test_confirmar_verificado_no_cambia_el_origen(
    owner_client: Client, events: list[Event]
) -> None:
    result = patch(owner_client, events[0], {'confirm': True})
    assert result['status'] == 200
    assert result['data']['origin'] == 'VERIFIED'


@pytest.mark.django_db
def test_mismo_valor_o_solo_notas_no_cambia_el_origen(
    owner_client: Client, events: list[Event]
) -> None:
    result = patch(owner_client, events[0], {'type': 'TILLAGE', 'notes': 'Coincide'})
    assert result['data']['origin'] == 'VERIFIED'
    assert result['data']['notes'] == 'Coincide'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'body',
    [
        {},
        {'type': 'RAIN'},
        {'sensor': 'MANUAL'},
        {'is_simulated': False},
        {'date_uncertainty_days': -1},
    ],
)
def test_patch_invalido_da_400(owner_client: Client, events: list[Event], body: dict) -> None:
    result = patch(owner_client, events[0], body)
    assert result['status'] == 400
    events[0].refresh_from_db()
    assert events[0].origin == 'VERIFIED'
    assert events[0].is_simulated is True


@pytest.mark.django_db
def test_patch_evento_inexistente_da_404(owner_client: Client) -> None:
    response = owner_client.patch(
        '/api/events/999999/', {'confirm': True}, content_type='application/json'
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_bitacora_ajena_da_404(
    client: Client, stranger_client: Client, lot: Lot, events: list[Event]
) -> None:
    assert stranger_client.get(events_url(lot)).status_code == 404
    assert client.get(events_url(lot)).status_code == 404


@pytest.mark.django_db
def test_bitacora_de_un_ejemplo_es_publica(client: Client, example_event: Event) -> None:
    response = client.get(f'/api/lots/{example_event.lot_id}/events/')
    assert response.status_code == 200
    assert response.json()['count'] == 1


@pytest.mark.django_db
def test_corregir_evento_ajeno_da_el_mismo_404_que_uno_inexistente(
    stranger_client: Client, events: list[Event]
) -> None:
    missing = patch(stranger_client, Event(pk=999999), {'confirm': True})
    foreign = patch(stranger_client, events[1], {'confirm': True})
    assert foreign == missing
    assert foreign['status'] == 404
    events[1].refresh_from_db()
    assert events[1].origin == 'ESTIMATED'


@pytest.mark.django_db
def test_corregir_evento_de_ejemplo_da_403(owner_client: Client, example_event: Event) -> None:
    result = patch(owner_client, example_event, {'confirm': True})
    assert result == {'status': 403, 'data': {'detail': EXAMPLE_READ_ONLY}}
    assert EXAMPLE_READ_ONLY == 'Los lotes de ejemplo son de solo lectura.'
    example_event.refresh_from_db()
    assert example_event.origin == 'ESTIMATED'


@pytest.mark.django_db
def test_corregir_evento_exige_token(client: Client, events: list[Event]) -> None:
    assert patch(client, events[1], {'confirm': True})['status'] == 401
    events[1].refresh_from_db()
    assert events[1].origin == 'ESTIMATED'
