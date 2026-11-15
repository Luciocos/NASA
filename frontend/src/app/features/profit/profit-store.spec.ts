import { TestBed } from '@angular/core/testing';

import { AuthSession } from '../../core/auth/auth-session';
import { TEST_TOKEN, TEST_USER } from '../../core/auth/testing';
import { SuggestedPrice } from '../../core/models';
import { MemoryStorage, OFFLINE_STORAGE } from '../../core/offline/storage';
import { emptyProfitInputs } from './profit-calc';
import { NO_CAMPAIGN, ProfitStore } from './profit-store';

// precio armado para la prueba, como si viniera del entorno de prueba reMarkets: no es real
const SUGGESTION: SuggestedPrice = {
  crop: 'SOY',
  symbol: 'SOJ.ROS/MAY26',
  price_usd_t: 300,
  kind: 'settlement',
  date: '2026-11-13',
  environment: 'REMARKET',
  simulated_market: true,
  source: 'Matba Rofex',
  disclaimer: 'Precio sugerido de mercado.',
};

describe('ProfitStore', () => {
  let storage: MemoryStorage;
  /** otra instancia sobre el mismo almacenamiento, como al recargar la página */
  const reopened = () => TestBed.runInInjectionContext(() => new ProfitStore());

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: OFFLINE_STORAGE, useValue: storage }],
    });
    TestBed.inject(AuthSession).start({ token: TEST_TOKEN, user: TEST_USER });
  });

  it('guarda el precio sugerido de Rofex con los números de la campaña y vuelve al recargar', () => {
    const inputs = { ...emptyProfitInputs(), priceUsdT: 300 };
    TestBed.inject(ProfitStore).save(1, '2025/26', inputs, SUGGESTION);

    const store = reopened();
    expect(store.load(1, '2025/26')).toEqual(inputs);
    expect(store.loadSuggestion(1, '2025/26')).toEqual(SUGGESTION);
    // otra campaña no la hereda
    expect(store.loadSuggestion(1, '2024/25')).toBeNull();
  });

  it('lo cargado sin campaña pasa a la primera, con su sugerencia', () => {
    TestBed.inject(ProfitStore).save(
      1,
      NO_CAMPAIGN,
      { ...emptyProfitInputs(), priceUsdT: 300 },
      SUGGESTION,
    );
    expect(reopened().loadSuggestion(1, '2025/26')).toEqual(SUGGESTION);
  });

  it('sin sugerencia, o con una guardada sin la forma de la respuesta, no hay sugerencia', () => {
    const store = TestBed.inject(ProfitStore);
    store.save(1, '2025/26', { ...emptyProfitInputs(), priceUsdT: 310 });
    expect(reopened().loadSuggestion(1, '2025/26')).toBeNull();

    const key = TestBed.inject(AuthSession).userKey('profit:v1')!;
    storage.setItem(
      key,
      JSON.stringify({
        '1|2025/26': {
          ...emptyProfitInputs(),
          priceUsdT: 300,
          suggestion: { ...SUGGESTION, price_usd_t: 'trescientos' },
        },
      }),
    );
    const store2 = reopened();
    expect(store2.loadSuggestion(1, '2025/26')).toBeNull();
    // los números siguen sirviendo
    expect(store2.load(1, '2025/26').priceUsdT).toBe(300);
  });
});
