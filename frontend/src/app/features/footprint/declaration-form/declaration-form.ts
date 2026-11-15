import { Component, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { Api } from '../../../core/api';
import { Crop, DeclarableInput, DeclarationRequest, Footprint } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { HelpTip } from '../help-tip/help-tip';

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
    label: 'Nitrógeno',
    unit: 'kg N/ha',
    hint: 'aplicado como nutriente, no como producto: 100 kg de urea son 46 kg de N.',
  },
  {
    key: 'FERTILIZER_P',
    label: 'Fósforo',
    unit: 'kg P2O5/ha',
    hint: 'aplicado como nutriente, no como producto: 100 kg de MAP son 52 kg de P2O5.',
  },
  {
    key: 'DIESEL',
    label: 'Gasoil',
    unit: 'l/ha',
    hint: 'el de las labores: siembra, pulverizaciones y cosecha.',
  },
  {
    key: 'PESTICIDE',
    label: 'Fitosanitarios',
    unit: 'kg p. a./ha',
    hint: 'herbicidas, insecticidas y fungicidas, en kg de principio activo (p. a.) por hectárea.',
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
 * El productor declara rendimiento e insumos de una campaña, en una grilla compacta. Lo
 * declarado reemplaza al valor de referencia; un campo vacío vuelve a usar la referencia (si
 * existe). La explicación y la aclaración de cada campo van en la ayuda (i) de la tarjeta.
 */
@Component({
  imports: [HelpTip, Icon, SectionCard],
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
          ? 'Escribí la campaña, por ejemplo 2026/27.'
          : 'Revisá los campos marcados: usá solo números, con coma para los decimales.',
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

/** valor precargado con coma decimal y sin separador de miles: 9.5 -> "9,5" */
function toText(value: number): string {
  return String(value).replace('.', ',');
}

/** Campo vacío: null (borra lo declarado). Acepta coma decimal. */
function toNumber(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

/** nombre de cada campo del backend en el idioma de la pantalla */
const FIELD_NAMES: Record<string, string> = {
  campaign: 'Campaña',
  crop: 'Cultivo',
  yield_t_ha: 'Rinde',
  inputs: 'Insumos',
};

/** el error en lenguaje llano: sin conexión, sin permiso o lo que el servidor objetó del dato */
function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'No hay conexión: revisá tu internet y probá de nuevo.';
  if (err.status === 401) return 'Tu sesión se cerró: volvé a ingresar para guardar tus datos.';
  if (err.status === 403) return 'Este lote es de solo lectura: no se pueden cargar datos.';
  if (err.status >= 500) return 'No pudimos guardar en este momento. Probá de nuevo en un rato.';
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
    if (text) return `No se pudo guardar. ${text}`;
  }
  return 'No se pudo guardar. Probá de nuevo.';
}

/** los textos de un error de validación, aunque vengan anidados ({"inputs": {"DIESEL": [..]}}) */
function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(messagesOf);
  return [];
}
