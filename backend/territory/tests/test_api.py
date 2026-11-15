import pytest
from rest_framework.test import APIClient

from lots.models import Lot

SQUARE = {
    'type': 'Polygon',
    'coordinates': [
        [[-61.2, -33.0], [-61.19, -33.0], [-61.19, -33.01], [-61.2, -33.01], [-61.2, -33.0]]
    ],
}


@pytest.mark.django_db
def test_checks_endpoint_returns_three_checks():
    lot = Lot.objects.create(name='Ejemplo', geometry=SQUARE, public_example=True)
    response = APIClient().get(f'/api/lots/{lot.pk}/territorial-checks/')
    assert response.status_code == 200
    body = response.json()
    assert 'disclaimer' in body
    assert [c['key'] for c in body['checks']] == ['periurban', 'otbn', 'bpa']
    for check in body['checks']:
        assert check['status'] in {'CLEAR', 'POSSIBLE_CONFLICT', 'NO_DATA'}
