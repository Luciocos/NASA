import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FootprintPage } from './footprint-page';

describe('FootprintPage', () => {
  let component: FootprintPage;
  let fixture: ComponentFixture<FootprintPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FootprintPage],
    }).compileComponents();

    fixture = TestBed.createComponent(FootprintPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
