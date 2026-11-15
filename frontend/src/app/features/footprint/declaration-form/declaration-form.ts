import { Component, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { Api } from '../../../core/api';
import { Crop, DeclarableInput, DeclarationRequest, Footprint } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { InfoTip } from '../../../shared/ui/info-tip/info-tip';

let nextId = 0;

interface Field {
  key: DeclarableInput;
  label: string;
  unit: string;
  hint: string;
}

/**
 * Campos del formulario. Las unidades son las que esperan los factores de emisión. El rótulo es
 * corto; la aclaración va en la ayuda (i) y queda unida al campo con aria-describedby.
 */
const FIELDS: Field[] = [
  {
    key: 'FERTILIZER_N',
    label: 'Nitrogen',
    unit: 'kg N/ha',
    hint: 'applied as a nutrient, not as a product: 100 kg of urea is 46 kg of N.',
  },
  {
    key: 'FERTILIZER_P',
    label: 'Phosphorus',
    unit: 'kg P2O5/ha',
    hint: 'applied as a nutrient, not as a product: 100 kg of MAP is 52 kg of P2O5.',
  },
  {
    key: 'DIESEL',
    label: 'Diesel',
    unit: 'l/ha',
    hint: 'used in field work: sowing, spraying and harvest.',
  },
  {
    key: 'PESTICIDE',
    label: 'Pesticides',
    unit: 'kg a.i./ha',
    hint: 'herbicides, insecticides and fungicides, in kg of active ingredient (a.i.) per hectare.',
  },
  { key: 'SEED', label: 'Seed', unit: 'kg/ha', hint: '' },
];

// Componente de la huella del que se toma el valor declarado de cada categoría
const COMPONENT_OF: Record<DeclarableInput, string> = {
  FERTILIZER_N: 'fertilizer_n_production',
  FERTILIZER_P: 'fertilizer_p_production',
  DIESEL: 'diesel',
  PESTICIDE: 'pesticides',
  SEED: 'seed',
};

const CROPS: { value: Crop; label: string }[] = [
  { value: 'SOY', label: 'Soybean' },
  { value: 'CORN', label: 'Corn' },
  { value: 'WHEAT', label: 'Wheat' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * El productor declara rendimiento e insumos de una campaña, en una grilla compacta. Lo
 * declarado reemplaza al valor de referencia; un campo vacío vuelve a usar la referencia (si
 * existe). La explicación y la aclaración de cada campo van en la ayuda (i) de la tarjeta.
 */
@Component({
  imports: [InfoTip, Icon, SectionCard],
  selector: 'app-declaration-form',
  styleUrl: './declaration-form.css',
  templateUrl: './declaration-form.html',
})
export class DeclarationForm {
  private readonly api = inject(Api);

  readonly lotId = input.required<number>();
  readonly footprint = input<Footprint | null>(null);
  /** nivel de los títulos: 2 como página; 3 adentro del popup del lote, debajo de su nombre */
  readonly level = input<2 | 3>(2);
  readonly declared = output<Footprint>();

  /** prefijo de los id de los campos: une cada rótulo y su ayuda con su control */
  protected readonly uid = `declaration-${nextId++}`;
  protected readonly fields = FIELDS;
  protected readonly crops = CROPS;
  protected readonly campaign = signal('2026/27');
  protected readonly crop = signal<Crop>('SOY');
  protected readonly yieldValue = signal('');
  protected readonly values = signal<Record<DeclarableInput, string>>({
    FERTILIZER_N: '',
    FERTILIZER_P: '',
    DIESEL: '',
    PESTICIDE: '',
    SEED: '',
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  /** campos con algo que no es un número ('yield' o la categoría): se marcan y no se manda nada */
  protected readonly invalid = signal<string[]>([]);

  constructor() {
    // Precarga con la campaña mostrada y los valores ya declarados (no las referencias)
    effect(() => {
      const fp = this.footprint();
      if (!fp?.campaign) return;
      this.campaign.set(fp.campaign.label);
      this.crop.set(fp.campaign.crop);
      this.yieldValue.set(
        fp.yield.origin === 'DECLARED' && fp.yield.value !== null ? toText(fp.yield.value) : '',
      );
      // Se arma desde cero: leer this.values() acá haría que el effect se dispare a sí mismo
      const next = {} as Record<DeclarableInput, string>;
      for (const field of FIELDS) {
        const component = fp.components.find((c) => c.key === COMPONENT_OF[field.key]);
        const declared =
          component?.activity.origin === 'DECLARED' && component.activity.quantity !== null;
        next[field.key] = declared ? toText(component!.activity.quantity!) : '';
      }
      this.values.set(next);
    });
  }

  protected setValue(key: DeclarableInput, value: string): void {
    this.values.update((values) => ({ ...values, [key]: value }));
  }

  protected save(): void {
    const body: DeclarationRequest = {
      campaign: this.campaign().trim(),
      crop: this.crop(),
      yield_t_ha: toNumber(this.yieldValue()),
      inputs: Object.fromEntries(
        FIELDS.map((field) => [field.key, toNumber(this.values()[field.key])]),
      ),
    };
    // NaN viajaría como null y borraría lo declarado sin avisar: se frena acá
    const invalid = [
      ...(Number.isNaN(body.yield_t_ha) ? ['yield'] : []),
      ...FIELDS.filter((field) => Number.isNaN(body.inputs?.[field.key])).map((f) => f.key),
    ];
    this.invalid.set(invalid);
    this.saved.set(false);
    if (!body.campaign || invalid.length > 0) {
      this.error.set(
        !body.campaign
          ? 'Enter the season, for example 2026/27.'
          : 'Check the highlighted fields: use numbers only, for example 9.5.',
      );
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api.declare(this.lotId(), body).subscribe({
      next: (footprint) => {
        this.saving.set(false);
        this.saved.set(true);
        this.declared.emit(footprint);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(describeError(err));
      },
    });
  }
}

/** valor precargado con punto decimal y sin separador de miles, como el resto de la pantalla: 9.5 -> "9.5" */
function toText(value: number): string {
  return String(value);
}

/** Campo vacío: null (borra lo declarado). Acepta punto o coma decimal. */
function toNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

/** nombre de cada campo del backend en el idioma de la pantalla */
const FIELD_NAMES: Record<string, string> = {
  campaign: 'Season',
  crop: 'Crop',
  yield_t_ha: 'Yield',
  inputs: 'Inputs',
};

/** el error en lenguaje llano: sin conexión, sin permiso o lo que el servidor objetó del dato */
function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'No connection: check your internet and try again.';
  if (err.status === 401) return 'Your session has ended: log in again to save your data.';
  if (err.status === 403) return 'This field is read-only: data cannot be entered.';
  if (err.status >= 500) return 'We could not save right now. Please try again in a moment.';
  const body = err.error as Record<string, unknown> | null;
  if (body && typeof body === 'object') {
    const text = Object.entries(body)
      .map(([field, messages]) => {
        const detail = messagesOf(messages).join(' ');
        const name = FIELD_NAMES[field];
        return name && detail ? `${name}: ${detail}` : detail;
      })
      .filter(Boolean)
      .join(' · ');
    if (text) return `Could not save. ${text}`;
  }
  return 'Could not save. Please try again.';
}

/** los textos de un error de validación, aunque vengan anidados ({"inputs": {"DIESEL": [..]}}) */
function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(messagesOf);
  return [];
}
