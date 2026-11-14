import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimulatedNotice } from './simulated-notice';

describe('SimulatedNotice', () => {
  let component: SimulatedNotice;
  let fixture: ComponentFixture<SimulatedNotice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulatedNotice],
    }).compileComponents();

    fixture = TestBed.createComponent(SimulatedNotice);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
