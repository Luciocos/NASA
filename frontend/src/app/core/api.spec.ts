import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Api } from './api';
import { LandUseDeclaration, LotDetail } from './models';

// lote y declaración armados para la prueba: no son datos de un lote real
const DECLARED: LandUseDeclaration = {
  unchanged: true,
  declared_at: '2026-11-15T10:30:00-03:00',
  origin: 'DECLARED',
};

const LOT: LotDetail = {
  id: 7,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-61.2, -33.05],
        [-61.19, -33.05],
        [-61.19, -33.04],
        [-61.2, -33.04],
        [-61.2, -33.05],
      ],
    ],
  },
  area_ha: 50,
  created_at: '2026-11-15T09:00:00-03:00',
  event_count: 0,
  is_example: false,
  owned: true,
  campaigns: [],
  land_use_declaration: null,
};

describe('Api', () => {
  let service: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('declareLandUse manda unchanged al lote y devuelve la declaración', () => {
    let result: LandUseDeclaration | undefined;

    service.declareLandUse(7, true).subscribe((value) => (result = value));
    const request = http.expectOne({ method: 'POST', url: '/api/lots/7/land-use/' });
    expect(request.request.body).toEqual({ unchanged: true });
    request.flush(DECLARED);

    expect(result).toEqual(DECLARED);
  });

  it('declareLandUse manda false tal cual: el productor declara que el uso cambió', () => {
    let result: LandUseDeclaration | undefined;

    service.declareLandUse(7, false).subscribe((value) => (result = value));
    const request = http.expectOne({ method: 'POST', url: '/api/lots/7/land-use/' });
    expect(request.request.body).toEqual({ unchanged: false });
    request.flush({ ...DECLARED, unchanged: false });

    expect(result?.unchanged).toBe(false);
  });

  it('declareLandUse deja pasar el 403 de un lote de ejemplo', () => {
    let error: HttpErrorResponse | undefined;

    service.declareLandUse(1, true).subscribe({ error: (value) => (error = value) });
    http
      .expectOne({ method: 'POST', url: '/api/lots/1/land-use/' })
      .flush(
        { detail: 'Los lotes de ejemplo son de solo lectura.' },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(error?.status).toBe(403);
    expect(error?.error).toEqual({ detail: 'Los lotes de ejemplo son de solo lectura.' });
  });

  it('lot trae la declaración de uso del suelo en la ficha', () => {
    let lot: LotDetail | undefined;

    service.lot(7).subscribe((value) => (lot = value));
    http
      .expectOne({ method: 'GET', url: '/api/lots/7/' })
      .flush({ ...LOT, land_use_declaration: DECLARED });

    expect(lot?.land_use_declaration).toEqual(DECLARED);
  });
});
