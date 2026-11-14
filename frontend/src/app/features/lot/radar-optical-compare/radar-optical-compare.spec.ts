import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RadarOpticalCompare } from './radar-optical-compare';

describe('RadarOpticalCompare', () => {
  let component: RadarOpticalCompare;
  let fixture: ComponentFixture<RadarOpticalCompare>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RadarOpticalCompare],
    }).compileComponents();

    fixture = TestBed.createComponent(RadarOpticalCompare);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
