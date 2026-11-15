import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Footprint } from '../../../core/models';
import { makeFootprint } from '../testing';
import { DeclarationForm } from './declaration-form';

describe('DeclarationForm', () => {
  let fixture: ComponentFixture<DeclarationForm>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const input = (placeholder: string, index = 0) =>
    el().querySelectorAll<HTMLInputElement>(`input[placeholder="${placeholder}"]`)[index];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeclarationForm],
      providers: [provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DeclarationForm);
    fixture.componentRef.setInput('lotId', 5);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('manda lo declarado y null en los campos vacíos', async () => {
    const declared: Footprint[] = [];
    fixture.componentInstance.declared.subscribe((fp) => declared.push(fp));
    const nitrogen = input('Not declared', 0);
    nitrogen.value = '90,5';
    nitrogen.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    const req = http.expectOne('/api/lots/5/declaration/');
    expect(req.request.body.campaign).toBe('2026/27');
    expect(req.request.body.inputs.FERTILIZER_N).toBe(90.5);
    expect(req.request.body.inputs.DIESEL).toBeNull();
    expect(req.request.body.yield_t_ha).toBeNull();
    req.flush(makeFootprint());
    expect(declared.length).toBe(1);
  });

  it('cada campo tiene un rótulo corto y su aclaración, en la ayuda (i), unida al control', () => {
    const nitrogen = input('Not declared', 0);
    const label = el().querySelector(`label[for="${nitrogen.id}"]`)?.textContent ?? '';
    expect(label).toContain('Nitrogen');
    expect(label).toContain('kg N/ha');
    const hint = el().querySelector(`#${nitrogen.getAttribute('aria-describedby')}`);
    expect(hint?.textContent).toContain('100 kg of urea is 46 kg of N');
    expect(hint?.closest('app-info-tip')).not.toBeNull();
    // a la vista no quedan párrafos: la explicación también va en la ayuda
    expect(el().querySelector('form p')).toBeNull();
    expect(el().querySelector('app-info-tip')?.textContent).toContain(
      'What you enter is saved as Declared',
    );
  });

  it('no manda nada si un campo no es un número y lo marca', async () => {
    const diesel = input('Not declared', 2);
    diesel.value = 'veinte';
    diesel.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el().querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();

    http.expectNone('/api/lots/5/declaration/');
    expect(diesel.getAttribute('aria-invalid')).toBe('true');
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Check the highlighted fields',
    );
  });

  it('explica en lenguaje llano lo que objeta el servidor', async () => {
    el().querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    http
      .expectOne('/api/lots/5/declaration/')
      .flush(
        { yield_t_ha: ['Asegúrese de que este valor sea mayor o igual a 0.'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    const alert = el().querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('Yield: Asegúrese de que este valor sea mayor o igual a 0.');
    expect(alert).not.toContain('yield_t_ha');
  });

  it('precarga solo valores declarados, no las referencias', async () => {
    const fp = makeFootprint();
    fixture.componentRef.setInput('footprint', fp);
    await fixture.whenStable();
    const declaredYield = fp.yield.origin === 'DECLARED' ? String(fp.yield.value) : '';
    expect(input('Reference').value).toBe(declaredYield);
  });
});
