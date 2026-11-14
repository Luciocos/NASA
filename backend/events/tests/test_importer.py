import copy

import pytest

from events.importer import (
    ImportValidationError,
    LotAlreadyExistsError,
    import_lot,
    validate,
)
from lots.models import Lot

# Datos armados para la prueba: no representan un lote real.
VALID = {
    'lot': {
        'name': 'Lote de prueba',
        'renspa': None,
        'locality': 'Casilda',
        'province': 'Santa Fe',
        'geometry': {
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
        },
    },
    'campaigns': [{'label': '2025/26', 'crop': 'SOY', 'crop_origin': 'DECLARED'}],
    'events': [
        {
            'type': 'TILLAGE',
            'date': '2026-10-12',
            'date_uncertainty_days': 12,
            'sensor': 'MANUAL',
            'origin': 'DECLARED',
            'confidence': None,
            'campaign': '2025/26',
            'is_simulated': True,
        }
    ],
}


def test_validate_acepta_el_contrato() -> None:
    assert validate(VALID) == []


def test_validate_junta_todos_los_errores() -> None:
    data = copy.deepcopy(VALID)
    data['lot']['geometry'] = {'type': 'Point', 'coordinates': [0, 0]}
    data['events'][0]['type'] = 'RAIN'
    data['events'][0]['date'] = '12/10/2026'
    data['events'][0]['confidence'] = 1.5
    data['events'][0]['campaign'] = '2019/20'

    errors = validate(data)

    assert len(errors) == 5


@pytest.mark.django_db
def test_import_crea_lote_campanias_y_eventos() -> None:
    lot = import_lot(VALID)

    assert lot.area_ha > 0
    assert lot.renspa == ''
    assert lot.campaigns.count() == 1
    event = lot.events.get()
    assert event.campaign.label == '2025/26'
    assert event.is_simulated is True
    assert event.confidence is None


@pytest.mark.django_db
def test_import_invalido_no_guarda_nada() -> None:
    data = copy.deepcopy(VALID)
    data['events'][0]['sensor'] = 'NISAR2'

    with pytest.raises(ImportValidationError):
        import_lot(data)

    assert Lot.objects.count() == 0


@pytest.mark.django_db
def test_import_repetido_no_duplica_salvo_replace() -> None:
    import_lot(VALID)

    with pytest.raises(LotAlreadyExistsError):
        import_lot(VALID)
    import_lot(VALID, replace=True)

    assert Lot.objects.count() == 1
