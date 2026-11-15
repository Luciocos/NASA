import { Service, inject } from '@angular/core';

import { AuthSession } from '../../core/auth/auth-session';
import { SuggestedPrice } from '../../core/models';
import { OFFLINE_STORAGE } from '../../core/offline/storage';
import { COST_KEYS, ProfitInputs, emptyProfitInputs } from './profit-calc';

// a nombre del usuario: lotestigo:u<id>:profit:v1 (se borra al salir)
const STORAGE_NAME = 'profit:v1';

/** campaña de un lote que todavía no tiene ninguna declarada */
export const NO_CAMPAIGN = '';

/**
 * lo guardado de una campaña: los números y, si se pidió, el precio sugerido de Rofex con el que
 * se compara el precio (así un precio que vino de Rofex sigue estimado, y uno de prueba sigue
 * rotulado como tal, después de recargar)
 */
type StoredEntry = ProfitInputs & { suggestion?: unknown };
type Stored = Record<string, StoredEntry>;

/**
 * precios, rinde y costos que declara el productor, por lote y campaña. el backend no tiene
 * dónde guardarlos todavía: quedan en este dispositivo, a nombre de quien ingresó. sin sesión
 * viven solo mientras la pestaña esté abierta
 */
@Service()
export class ProfitStore {
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly session = inject(AuthSession);
  private unsaved: Stored = {};

  /**
   * lo guardado para esa campaña. si la campaña no tiene nada propio, lo que se cargó cuando el
   * lote todavía no tenía campañas, para no perderlo al declarar la primera
   */
  load(lotId: number, campaign: string): ProfitInputs {
    const saved = this.entry(lotId, campaign);
    return saved ? normalize(saved) : emptyProfitInputs();
  }

  /** el precio sugerido de Rofex guardado junto con esos números (el mismo que usa load), o null */
  loadSuggestion(lotId: number, campaign: string): SuggestedPrice | null {
    return suggestionOf(this.entry(lotId, campaign)?.suggestion);
  }

  save(
    lotId: number,
    campaign: string,
    inputs: ProfitInputs,
    suggestion: SuggestedPrice | null = null,
  ): void {
    const storageKey = this.session.userKey(STORAGE_NAME);
    const all = this.read(storageKey);
    all[key(lotId, campaign)] = suggestion ? { ...inputs, suggestion } : inputs;
    if (storageKey === null) {
      this.unsaved = all;
      return;
    }
    try {
      this.storage.setItem(storageKey, JSON.stringify(all));
    } catch {
      // sin lugar en el dispositivo: el cálculo sigue andando mientras la pestaña esté abierta
    }
  }

  private entry(lotId: number, campaign: string): StoredEntry | undefined {
    const all = this.read();
    return all[key(lotId, campaign)] ?? all[key(lotId, NO_CAMPAIGN)];
  }

  private read(storageKey = this.session.userKey(STORAGE_NAME)): Stored {
    if (storageKey === null) return { ...this.unsaved };
    try {
      const value = JSON.parse(this.storage.getItem(storageKey) ?? '{}') as unknown;
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

const SUGGESTION_KINDS: readonly string[] = ['settlement', 'last', 'close'];

/** la sugerencia guardada, si tiene la forma de la respuesta de Rofex; si no, null */
function suggestionOf(raw: unknown): SuggestedPrice | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Record<keyof SuggestedPrice, unknown>>;
  const valid =
    num(s.price_usd_t) !== null &&
    typeof s.symbol === 'string' &&
    typeof s.kind === 'string' &&
    SUGGESTION_KINDS.includes(s.kind) &&
    (s.date === null || typeof s.date === 'string') &&
    typeof s.simulated_market === 'boolean' &&
    typeof s.source === 'string' &&
    typeof s.disclaimer === 'string';
  return valid ? (raw as SuggestedPrice) : null;
}

function normalize(raw: Partial<ProfitInputs>): ProfitInputs {
  const base = emptyProfitInputs();
  const costs = { ...base.costs };
  for (const cost of COST_KEYS) costs[cost] = num(raw.costs?.[cost]);
  return {
    priceUsdT: num(raw.priceUsdT),
    yieldTHa: num(raw.yieldTHa),
    commercialUsdT: num(raw.commercialUsdT),
    costs,
  };
}
