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
    const nitrogen = input('Sin declarar', 0);
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

  it('precarga solo valores declarados, no las referencias', async () => {
    const fp = makeFootprint();
    fixture.componentRef.setInput('footprint', fp);
    await fixture.whenStable();
    const declaredYield = fp.yield.origin === 'DECLARED' ? String(fp.yield.value) : '';
    expect(input('Referencia').value).toBe(declaredYield);
  });
});
