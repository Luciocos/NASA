import { Component, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { Api } from '../../../core/api';
import { Crop, DeclarableInput, DeclarationRequest, Footprint } from '../../../core/models';

interface Field {
  key: DeclarableInput;
  label: string;
  unit: string;
  hint: string;
}

/** Campos del formulario. Las unidades son las que esperan los factores de emisión. */
const FIELDS: Field[] = [
  {
    key: 'FERTILIZER_N',
    label: 'Nitrógeno aplicado',
    unit: 'kg N/ha',
    hint: 'Nutriente, no producto: 100 kg de urea son 46 kg de N.',
  },
  {
    key: 'FERTILIZER_P',
    label: 'Fósforo aplicado',
    unit: 'kg P2O5/ha',
    hint: 'Nutriente, no producto: 100 kg de MAP son 52 kg de P2O5.',
  },
  {
    key: 'DIESEL',
    label: 'Gasoil de labores',
    unit: 'l/ha',
    hint: 'Siembra, pulverizaciones y cosecha.',
  },
  {
    key: 'PESTICIDE',
    label: 'Fitosanitarios',
    unit: 'kg principio activo/ha',
    hint: 'Herbicidas, insecticidas y fungicidas, en principio activo.',
  },
  { key: 'SEED', label: 'Semilla', unit: 'kg/ha', hint: '' },
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
  { value: 'SOY', label: 'Soja' },
  { value: 'CORN', label: 'Maíz' },
  { value: 'WHEAT', label: 'Trigo' },
  { value: 'OTHER', label: 'Otro' },
];

/**
 * El productor declara rendimiento e insumos de una campaña. Lo declarado reemplaza al
 * valor de referencia; un campo vacío vuelve a usar la referencia (si existe).
 */
@Component({
  selector: 'app-declaration-form',
  styleUrl: './declaration-form.css',
  templateUrl: './declaration-form.html',
})
export class DeclarationForm {
  private readonly api = inject(Api);

  readonly lotId = input.required<number>();
  readonly footprint = input<Footprint | null>(null);
  readonly declared = output<Footprint>();

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

  constructor() {
    // Precarga con la campaña mostrada y los valores ya declarados (no las referencias)
    effect(() => {
      const fp = this.footprint();
      if (!fp?.campaign) return;
      this.campaign.set(fp.campaign.label);
      this.crop.set(fp.campaign.crop);
      this.yieldValue.set(
        fp.yield.origin === 'DECLARED' && fp.yield.value !== null ? String(fp.yield.value) : '',
      );
      // Se arma desde cero: leer this.values() acá haría que el effect se dispare a sí mismo
      const next = {} as Record<DeclarableInput, string>;
      for (const field of FIELDS) {
        const component = fp.components.find((c) => c.key === COMPONENT_OF[field.key]);
        const declared =
          component?.activity.origin === 'DECLARED' && component.activity.quantity !== null;
        next[field.key] = declared ? String(component!.activity.quantity) : '';
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
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
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

/** Campo vacío: null (borra lo declarado). Acepta coma decimal. */
function toNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'No hay conexión con el backend.';
  const body = err.error as Record<string, string[]> | null;
  if (body && typeof body === 'object') {
    const text = Object.entries(body)
      .map(([field, messages]) => `${field}: ${[messages].flat().join(' ')}`)
      .join(' · ');
    if (text) return `No se pudo guardar: ${text}`;
  }
  return 'No se pudo guardar. Intentá de nuevo.';
}
