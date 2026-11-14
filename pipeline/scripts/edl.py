"""Autenticación con Earthdata Login y apertura remota de archivos HDF5.

Lee EARTHDATA_USERNAME y EARTHDATA_PASSWORD del .env de la raíz del repositorio.
Nunca imprime ni guarda las credenciales.
"""

import os
from pathlib import Path

import fsspec
import h5py
import requests
from dotenv import load_dotenv

REPO_DIR = Path(__file__).resolve().parents[2]
EDL = 'https://urs.earthdata.nasa.gov'


def _credentials() -> tuple[str, str]:
    load_dotenv(REPO_DIR / '.env')
    user = os.environ.get('EARTHDATA_USERNAME', '')
    password = os.environ.get('EARTHDATA_PASSWORD', '')
    if not user or not password:
        raise SystemExit('Faltan EARTHDATA_USERNAME y EARTHDATA_PASSWORD en el .env')
    return user, password


def get_token() -> str:
    """Devuelve un token de usuario de Earthdata (reutiliza uno vigente si existe)."""
    auth = _credentials()
    r = requests.get(f'{EDL}/api/users/tokens', auth=auth, timeout=30)
    r.raise_for_status()
    tokens = r.json()
    if tokens:
        return tokens[0]['access_token']
    r = requests.post(f'{EDL}/api/users/token', auth=auth, timeout=30)
    r.raise_for_status()
    return r.json()['access_token']


def open_remote_h5(url: str, token: str) -> h5py.File:
    """Abre un HDF5 remoto leyendo solo los bloques necesarios (HTTP range requests)."""
    fs = fsspec.filesystem('https', client_kwargs={'headers': {'Authorization': f'Bearer {token}'}})
    f = fs.open(url, 'rb', block_size=8 * 1024 * 1024, cache_type='blockcache')
    return h5py.File(f, 'r')
