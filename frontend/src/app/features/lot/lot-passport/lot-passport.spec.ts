import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LotDetail, PassportLink } from '../../../core/models';
import { LotPassport } from './lot-passport';

// lote armado para la prueba: no representa un lote real
const LOT: LotDetail = {
  id: 7,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [],
};

const LINK: PassportLink = {
  token: 'abc',
  lot: 7,
  url: '/pasaporte/abc',
  created_at: '2026-11-15T10:00:00Z',
  expires_at: null,
};

describe('LotPassport', () => {
  let fixture: ComponentFixture<LotPassport>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const share = () => el().querySelector<HTMLButtonElement>('button.share-btn');
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  async function setup(lot: LotDetail = LOT): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LotPassport],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LotPassport);
    fixture.componentRef.setInput('lot', lot);
    await fixture.whenStable();
  }

  function stubClipboard(writeText: ReturnType<typeof vi.fn>): void {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }

  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('una sola acción: Compartir pasaporte, con lo que muestra el enlace', async () => {
    await setup();
    expect(el().querySelector('h2')?.textContent?.trim()).toBe('Pasaporte del lote');
    expect(share()?.textContent?.trim()).toBe('Compartir pasaporte');
    expect(share()?.classList).toContain('btn--primary');
    expect([...el().querySelectorAll('.includes li')].map((li) => li.textContent?.trim())).toEqual([
      'Campañas',
      'Bitácora',
      'Huella y puntaje',
    ]);
    http.expectNone('/api/lots/7/passport/');
  });

  it('genera el enlace, lo copia y deja abrirlo', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await setup();

    share()?.click();
    fixture.detectChanges();
    expect(share()?.textContent).toContain('Generando el enlace…');
    expect(share()?.getAttribute('aria-disabled')).toBe('true');
    const request = http.expectOne('/api/lots/7/passport/');
    expect(request.request.method).toBe('POST');
    request.flush(LINK);
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(new URL('/pasaporte/abc', document.baseURI).href);
    expect(el().textContent).toContain('Enlace copiado');
    const open = [...el().querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Abrir el pasaporte'),
    );
    expect(open?.getAttribute('href')).toBe('/pasaporte/abc');

    // la segunda vez copia el mismo enlace, sin generar otro
    share()?.click();
    await fixture.whenStable();
    http.expectNone('/api/lots/7/passport/');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('en un lote de ejemplo también se comparte', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    await setup({ ...LOT, is_example: true, owned: false });

    share()?.click();
    http.expectOne('/api/lots/7/passport/').flush(LINK);
    await fixture.whenStable();
    expect(el().textContent).toContain('Enlace copiado');
  });

  it('si el navegador no deja copiar, muestra el enlace para copiarlo a mano', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('sin permiso')));
    await setup();

    share()?.click();
    http.expectOne('/api/lots/7/passport/').flush(LINK);
    await fixture.whenStable();

    expect(el().textContent).toContain('Copiá el enlace');
    const field = el().querySelector<HTMLInputElement>('input.url');
    expect(field?.value).toBe(new URL('/pasaporte/abc', document.baseURI).href);
    expect(field?.readOnly).toBe(true);
  });

  it('si falla, lo dice y deja probar de nuevo', async () => {
    await setup();

    share()?.click();
    http.expectOne('/api/lots/7/passport/').flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    const alert = el().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No se pudo generar el pasaporte');
    share()?.click();
    http.expectOne('/api/lots/7/passport/');
  });

  it('con otro lote, el enlace del anterior no queda a la vista', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    await setup();
    share()?.click();
    http.expectOne('/api/lots/7/passport/').flush(LINK);
    await fixture.whenStable();
    expect(el().textContent).toContain('Enlace copiado');

    fixture.componentRef.setInput('lot', { ...LOT, id: 8 });
    await fixture.whenStable();
    expect(el().textContent).not.toContain('Enlace copiado');
    share()?.click();
    http.expectOne('/api/lots/8/passport/');
  });
});
