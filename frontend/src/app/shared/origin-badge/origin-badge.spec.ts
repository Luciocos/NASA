import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OriginBadge } from './origin-badge';

describe('OriginBadge', () => {
  let fixture: ComponentFixture<OriginBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OriginBadge],
    }).compileComponents();

    fixture = TestBed.createComponent(OriginBadge);
  });

  it('muestra el texto del origen, no solo el color', async () => {
    fixture.componentRef.setInput('origin', 'VERIFIED');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('Verified');
  });
});
