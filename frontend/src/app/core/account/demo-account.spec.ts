import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MemoryStorage, OFFLINE_STORAGE } from '../offline/storage';
import { DemoAccount } from './demo-account';
import { isExampleLot } from './examples';

describe('DemoAccount', () => {
  let storage: MemoryStorage;

  function create(): DemoAccount {
    TestBed.configureTestingModule({
      providers: [provideHttpClientTesting(), { provide: OFFLINE_STORAGE, useValue: storage }],
    });
    return TestBed.inject(DemoAccount);
  }

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('arranca sin cuenta y la abre con start', () => {
    const account = create();
    expect(account.active()).toBe(false);
    const session = account.start();
    expect(session.plan).toBe('free');
    expect(account.active()).toBe(true);
    expect(account.start().id).toBe(session.id);
  });

  it('recuerda los lotes de la cuenta y los guarda en el dispositivo', () => {
    const account = create();
    account.addLot(7);
    account.addLot(7);
    account.addLot(9);
    expect([...account.lotIds()]).toEqual([7, 9]);
    expect(account.owns(9)).toBe(true);
    expect(JSON.parse(storage.getItem('lotestigo:account:v1')!).lotIds).toEqual([7, 9]);

    account.removeLot(7);
    expect(account.owns(7)).toBe(false);
  });

  it('retoma la cuenta guardada e ignora lo que no tiene forma de cuenta', () => {
    storage.setItem(
      'lotestigo:account:v1',
      JSON.stringify({ id: 'x', lotIds: [3, 'a', 4], createdAt: '2026-11-14T00:00:00Z' }),
    );
    expect([...create().lotIds()]).toEqual([3, 4]);

    TestBed.resetTestingModule();
    storage.setItem('lotestigo:account:v1', '{roto');
    expect(create().active()).toBe(false);
  });

  it('end cierra la cuenta y la borra del dispositivo', () => {
    const account = create();
    account.addLot(1);
    account.end();
    expect(account.active()).toBe(false);
    expect(storage.getItem('lotestigo:account:v1')).toBeNull();
  });

  it('reconoce los lotes de ejemplo del pipeline', () => {
    expect(isExampleLot({ name: 'Lote 3' })).toBe(true);
    expect(isExampleLot({ name: 'lote test' })).toBe(false);
  });
});
