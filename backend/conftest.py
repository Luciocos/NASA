"""Fixtures comunes: productores con su token y clientes HTTP autenticados.

Las cuentas son ficticias, armadas para las pruebas.
"""

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client
from rest_framework.authtoken.models import Token

PASSWORD = 'trigo-y-soja-2026'


@pytest.fixture(autouse=True)
def _isolated_throttle_and_fast_hashing(settings) -> None:
    # El límite de intentos guarda su historial en la caché: se vacía en cada prueba
    cache.clear()
    # Hash rápido solo en las pruebas; la app usa el hasher por defecto de Django
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']


@pytest.fixture
def password() -> str:
    """Contraseña de las cuentas armadas con make_user."""
    return PASSWORD


def make_user(email: str, name: str = '') -> User:
    return User.objects.create_user(username=email, email=email, password=PASSWORD, first_name=name)


def token_client(user: User) -> Client:
    token, _created = Token.objects.get_or_create(user=user)
    return Client(headers={'Authorization': f'Token {token.key}'})


@pytest.fixture
def owner(db) -> User:
    return make_user('ana@example.com', 'Ana')


@pytest.fixture
def stranger(db) -> User:
    return make_user('beto@example.com', 'Beto')


@pytest.fixture
def owner_client(owner: User) -> Client:
    return token_client(owner)


@pytest.fixture
def stranger_client(stranger: User) -> Client:
    return token_client(stranger)
