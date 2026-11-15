import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { provideOfflineTesting } from './core/offline/testing';

@Component({ template: '' })
class Blank {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'mapa', component: Blank },
          // como una pantalla cuyo código no se pudo bajar sin conexión
          { path: 'rota', loadComponent: () => Promise.reject(new Error('sin red')) },
        ]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render brand', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/mapa');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('LoTestigo');
  });

  it('la landing usa su propio encabezado y su propio pie', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.topbar')).toBeNull();
    expect(compiled.querySelector('.footer')).toBeNull();
  });

  it('avisa si una pantalla no se pudo abrir, y el aviso se puede cerrar', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/mapa');
    await router.navigateByUrl('/rota').catch(() => undefined);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const alert = compiled.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'No se pudo abrir esa pantalla. Si estás sin conexión, probá de nuevo cuando vuelva la red.',
    );

    alert?.querySelector('button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('[role="alert"]')).toBeNull();
  });

  it('una navegación que funciona saca el aviso', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/rota').catch(() => undefined);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.nav-error')).not.toBeNull();

    await router.navigateByUrl('/mapa');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.nav-error')).toBeNull();
  });
});
