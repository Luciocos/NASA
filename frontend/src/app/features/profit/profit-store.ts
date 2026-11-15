import { Service, inject } from '@angular/core';

import { OFFLINE_STORAGE } from '../../core/offline/storage';
import { COST_KEYS, ProfitInputs, emptyProfitInputs } from './profit-calc';

const STORAGE_KEY = 'lotestigo:profit:v1';

type Stored = Record<string, ProfitInputs>;

/**
 * precios y costos que declara el productor, por lote y campaña. el backend no tiene dónde
 * guardarlos todavía: quedan en este dispositivo
 */
@Service()
export class ProfitStore {
  private readonly storage = inject(OFFLINE_STORAGE);

  load(lotId: number, campaign: string): ProfitInputs {
    const saved = this.read()[key(lotId, campaign)];
    return saved ? normalize(saved) : emptyProfitInputs();
  }

  save(lotId: number, campaign: string, inputs: ProfitInputs): void {
    const all = this.read();
    all[key(lotId, campaign)] = inputs;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // sin lugar en el dispositivo: el cálculo sigue andando mientras la pestaña esté abierta
    }
  }

  private read(): Stored {
    try {
      const value = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}') as unknown;
      return value && typeof value === 'object' ? (value as Stored) : {};
    } catch {
      return {};
    }
  }
}

function key(lotId: number, campaign: string): string {
  return `${lotId}|${campaign}`;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalize(raw: Partial<ProfitInputs>): ProfitInputs {
  const base = emptyProfitInputs();
  const costs = { ...base.costs };
  for (const cost of COST_KEYS) costs[cost] = num(raw.costs?.[cost]);
  return { priceUsdT: num(raw.priceUsdT), commercialUsdT: num(raw.commercialUsdT), costs };
}
