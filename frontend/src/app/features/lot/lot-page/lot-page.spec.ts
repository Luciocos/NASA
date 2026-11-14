import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LotPage } from './lot-page';

describe('LotPage', () => {
  let component: LotPage;
  let fixture: ComponentFixture<LotPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotPage],
    }).compileComponents();

    fixture = TestBed.createComponent(LotPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
