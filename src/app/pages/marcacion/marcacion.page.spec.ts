import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarcacionPage } from './marcacion.page';

describe('MarcacionPage', () => {
  let component: MarcacionPage;
  let fixture: ComponentFixture<MarcacionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MarcacionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
