import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { AuthService, AuthUser } from './core/auth/auth.service';
import { provideOfflineTesting } from './core/offline/testing';

@Component({ template: '' })
class Blank {}

// sesión armada para la prueba: no es una cuenta real
const QA: AuthUser = { id: 1, email: 'qa@example.com', name: 'QA' };

describe('App', () => {
  const user = signal<AuthUser | null>(QA);

  beforeEach(async () => {
    user.set(QA);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'mapa', component: Blank },
          { path: 'ejemplos', component: Blank },
          // como una pantalla cuyo código no se pudo bajar sin conexión
          { path: 'rota', loadComponent: () => Promise.reject(new Error('sin red')) },
        ]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        {
          provide: AuthService,
          useValue: {
            user,
            loggedIn: computed(() => user() !== null),
            logout: () => user.set(null),
          },
        },
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

  it('con sesión muestra Mi campo, Marcar lote y la barra de pestañas del celular', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/mapa');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const nav = compiled.querySelector('.topbar .nav')?.textContent ?? '';
    expect(nav).toContain('Mi campo');
    expect(nav).toContain('Marcar lote');
    expect(compiled.querySelector('.tabbar')).not.toBeNull();
    expect(compiled.querySelector('a[href="/ingresar"]')).toBeNull();
    expect(fixture.nativeElement.classList).toContain('has-tabbar');
  });

  it('sin sesión muestra solo la marca e Ingresar', async () => {
    user.set(null);
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/ejemplos');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.topbar .nav')).toBeNull();
    expect(compiled.querySelector('.tabbar')).toBeNull();
    expect(compiled.querySelector('app-connection-status')).toBeNull();
    expect(compiled.querySelector('a[href="/ingresar"]')?.textContent).toContain('Ingresar');
    expect(compiled.querySelector('.brand')?.getAttribute('href')).toBe('/');
    expect(fixture.nativeElement.classList).not.toContain('has-tabbar');
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
