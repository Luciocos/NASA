import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PassportPage } from './passport-page';

describe('PassportPage', () => {
  let component: PassportPage;
  let fixture: ComponentFixture<PassportPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassportPage],
    }).compileComponents();

    fixture = TestBed.createComponent(PassportPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
