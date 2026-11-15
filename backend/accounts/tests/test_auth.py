"""Registro, ingreso, salida, datos propios y límite de intentos. Cuentas ficticias."""

import pytest
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import Client
from rest_framework.authtoken.models import Token

from accounts.serializers import EMAIL_TAKEN
from accounts.views import INVALID_CREDENTIALS
from core.exceptions import LOGIN_REQUIRED

NEW_PASSWORD = 'cosecha-gruesa-2026'


def register(client: Client, body: dict):
    return client.post('/api/auth/register/', body, content_type='application/json')


def login(client: Client, body: dict):
    return client.post('/api/auth/login/', body, content_type='application/json')


def django_messages(password: str, email: str) -> list[str]:
    try:
        validate_password(password, user=User(email=email))
    except ValidationError as error:
        return error.messages
    return []


@pytest.mark.django_db
def test_registro_devuelve_token_y_usuario_con_el_mail_en_minusculas(client: Client) -> None:
    response = register(
        client, {'name': 'Carla', 'email': ' Carla@Example.COM ', 'password': NEW_PASSWORD}
    )
    assert response.status_code == 201, response.json()
    data = response.json()
    user = User.objects.get()
    assert data == {
        'token': Token.objects.get(user=user).key,
        'user': {'id': user.pk, 'email': 'carla@example.com', 'name': 'Carla'},
    }
    assert user.username == user.email == 'carla@example.com'
    assert user.first_name == 'Carla'
    # Solo el hash de Django: la contraseña nunca se guarda ni se devuelve en claro
    assert user.password != NEW_PASSWORD
    assert user.check_password(NEW_PASSWORD)
    assert NEW_PASSWORD not in response.content.decode()


@pytest.mark.django_db
def test_registro_sin_nombre(client: Client) -> None:
    response = register(client, {'email': 'carla@example.com', 'password': NEW_PASSWORD})
    assert response.status_code == 201
    assert response.json()['user']['name'] == ''


@pytest.mark.django_db
def test_registro_con_mail_repetido(client: Client, owner: User) -> None:
    response = register(client, {'email': 'ANA@example.com', 'password': NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {'email': [EMAIL_TAKEN]}
    assert EMAIL_TAKEN == 'Ya hay una cuenta con ese mail.'
    assert User.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize('weak_password', ['123', '12345678', 'password', 'nuevo.productor'])
def test_registro_valida_la_contrasenia_con_django(client: Client, weak_password: str) -> None:
    email = 'nuevo.productor@example.com'
    expected = django_messages(weak_password, email)
    assert expected
    response = register(client, {'email': email, 'password': weak_password})
    assert response.status_code == 400
    assert response.json() == {'password': expected}
    assert not User.objects.exists()


@pytest.mark.django_db
def test_registro_valida_mail_y_campos_obligatorios(client: Client) -> None:
    response = register(client, {'email': 'no-es-un-mail', 'password': NEW_PASSWORD})
    assert response.status_code == 400
    assert response.json() == {'email': ['Ingresá un mail válido.']}
    response = register(client, {})
    assert response.status_code == 400
    assert set(response.json()) == {'email', 'password'}


@pytest.mark.django_db
def test_ingreso_devuelve_el_token_del_usuario(client: Client, owner: User, password: str) -> None:
    response = login(client, {'email': ' ANA@example.com', 'password': password})
    assert response.status_code == 200
    assert response.json() == {
        'token': Token.objects.get(user=owner).key,
        'user': {'id': owner.pk, 'email': 'ana@example.com', 'name': 'Ana'},
    }


@pytest.mark.django_db
def test_ingreso_incorrecto_no_dice_si_el_mail_existe(
    client: Client, owner: User, password: str
) -> None:
    wrong_password = login(client, {'email': 'ana@example.com', 'password': 'otra-cosa-123'})
    unknown_email = login(client, {'email': 'nadie@example.com', 'password': password})
    assert wrong_password.status_code == unknown_email.status_code == 400
    assert wrong_password.json() == unknown_email.json() == {'detail': INVALID_CREDENTIALS}
    assert INVALID_CREDENTIALS == 'Mail o contraseña incorrectos.'
    owner.is_active = False
    owner.save()
    assert login(client, {'email': 'ana@example.com', 'password': password}).status_code == 400
    assert not Token.objects.exists()


@pytest.mark.django_db
def test_ingreso_ignora_un_token_viejo(owner: User, password: str) -> None:
    stale = Client(headers={'Authorization': 'Token 0123456789abcdef'})
    response = login(stale, {'email': 'ana@example.com', 'password': password})
    assert response.status_code == 200


@pytest.mark.django_db
def test_me_devuelve_solo_los_datos_propios(client: Client, owner_client: Client, owner: User):
    response = owner_client.get('/api/auth/me/')
    assert response.status_code == 200
    assert response.json() == {'id': owner.pk, 'email': 'ana@example.com', 'name': 'Ana'}
    anonymous = client.get('/api/auth/me/')
    assert anonymous.status_code == 401
    assert anonymous.json() == {'detail': LOGIN_REQUIRED}
    assert anonymous['WWW-Authenticate'] == 'Token'
    stale = Client(headers={'Authorization': 'Token 0123456789abcdef'})
    assert stale.get('/api/auth/me/').status_code == 401


@pytest.mark.django_db
def test_salir_borra_el_token(client: Client, owner_client: Client, owner: User) -> None:
    assert client.post('/api/auth/logout/').status_code == 401
    response = owner_client.post('/api/auth/logout/')
    assert response.status_code == 204
    assert not Token.objects.filter(user=owner).exists()
    assert owner_client.get('/api/auth/me/').status_code == 401
    assert owner_client.get('/api/lots/').status_code == 401


@pytest.mark.django_db
def test_token_viejo_no_rompe_las_rutas_publicas() -> None:
    stale = Client(headers={'Authorization': 'Token 0123456789abcdef'})
    assert stale.get('/api/health/').status_code == 200
    assert stale.get('/api/examples/').status_code == 200
    assert stale.get('/api/lots/').status_code == 401


@pytest.mark.django_db
def test_limite_de_intentos_en_registro_e_ingreso(client: Client) -> None:
    # Cuerpos vacíos: cuentan como intento aunque no lleguen a validar nada
    statuses = [login(client, {}).status_code for _ in range(20)]
    assert statuses == [400] * 20
    response = login(client, {})
    assert response.status_code == 429
    assert response.json()['detail'].startswith('Hubo demasiados intentos seguidos.')
    assert int(response['Retry-After']) > 0
    # Registro e ingreso comparten el límite
    assert register(client, {}).status_code == 429
