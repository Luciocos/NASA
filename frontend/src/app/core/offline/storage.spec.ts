import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MemoryStorage, OFFLINE_STORAGE } from './storage';
import { provideOfflineTesting } from './testing';

describe('OFFLINE_STORAGE', () => {
  it('usa el localStorage del navegador', () => {
    expect(TestBed.inject(OFFLINE_STORAGE)).toBe(window.localStorage);
  });

  it('cae a memoria, marcada como volátil, si el navegador bloquea localStorage', () => {
    const blockedView = {
      get localStorage(): Storage {
        throw new DOMException('acceso denegado', 'SecurityError');
      },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: blockedView } }],
    });

    const storage = TestBed.inject(OFFLINE_STORAGE);

    expect(storage).toBeInstanceOf(MemoryStorage);
    expect(storage.volatile).toBe(true);
  });

  it('provideOfflineTesting da un almacenamiento vacío y propio de cada prueba', () => {
    window.localStorage.setItem('lotestigo:outbox:v1', '[]');
    TestBed.configureTestingModule({ providers: [provideOfflineTesting()] });

    const storage = TestBed.inject(OFFLINE_STORAGE);

    expect(storage).not.toBe(window.localStorage);
    expect(storage.length).toBe(0);
    expect(storage.volatile).toBe(false);
    window.localStorage.removeItem('lotestigo:outbox:v1');
  });
});

describe('MemoryStorage', () => {
  it('guarda, enumera y borra como Storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    storage.setItem('a', '3');

    expect(storage.length).toBe(2);
    expect(storage.getItem('a')).toBe('3');
    expect(storage.getItem('falta')).toBeNull();
    expect([storage.key(0), storage.key(1), storage.key(2)]).toEqual(['a', 'b', null]);

    storage.removeItem('a');
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe('b');
  });
});
