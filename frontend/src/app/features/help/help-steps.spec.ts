import { lotTabs } from '../../shared/ui/lot-tabs/lot-tabs';
import { HELP_STEPS, helpStepIndex } from './help-steps';

describe('HELP_STEPS', () => {
  it('son nueve pasos, en el orden de la app: las pestañas del popup de izquierda a derecha', () => {
    expect(HELP_STEPS.map((step) => step.key)).toEqual([
      'marcar',
      'abrir',
      'satelite',
      'bitacora',
      'practicas',
      'huella',
      'fertilizacion',
      'rentabilidad',
      'pasaporte',
    ]);
    // la guía sigue el orden de la fila de pestañas; las que no piden cargar nada (como Cuenca y
    // Caudal, que muestra datos del pipeline) no tienen paso
    const tabs = HELP_STEPS.flatMap((step) => (step.tab ? [step.tab] : []));
    const ordered = lotTabs(1)
      .map((tab) => tab.key)
      .filter((key) => tabs.includes(key));
    expect(tabs).toEqual(ordered);
  });

  it('cada paso tiene una frase de seis palabras como mucho y una descripción para la imagen', () => {
    for (const step of HELP_STEPS) {
      expect(step.caption.trim().split(/\s+/).length).toBeLessThanOrEqual(6);
      expect(step.description.length).toBeGreaterThan(step.caption.length);
    }
  });

  it('nunca habla de certificación', () => {
    for (const step of HELP_STEPS) {
      expect(`${step.caption} ${step.description}`.toLowerCase()).not.toContain('certific');
    }
  });

  it('los pasos de una pestaña del popup la nombran', () => {
    const tabs = Object.fromEntries(HELP_STEPS.map((step) => [step.key, step.tab]));
    expect(tabs).toMatchObject({
      satelite: 'satellite',
      huella: 'footprint',
      practicas: 'practices',
      rentabilidad: 'profit',
      fertilizacion: 'fertilization',
      bitacora: 'log',
      marcar: null,
      abrir: null,
      pasaporte: 'passport',
    });
  });
});

describe('helpStepIndex', () => {
  it('encuentra el paso por su clave, con o sin mayúsculas y tildes', () => {
    expect(helpStepIndex('huella')).toBe(5);
    expect(helpStepIndex(' Huella ')).toBe(5);
    expect(helpStepIndex('satélite')).toBe(2);
    expect(helpStepIndex('pasaporte')).toBe(8);
  });

  it('acepta la pestaña del popup del lote', () => {
    expect(helpStepIndex('footprint')).toBe(5);
    expect(helpStepIndex('log')).toBe(3);
    expect(helpStepIndex('practices')).toBe(4);
    expect(helpStepIndex('profit')).toBe(7);
    expect(helpStepIndex('passport')).toBe(8);
  });

  it('sin paso, o con uno que no existe, arranca en el primero', () => {
    expect(helpStepIndex(null)).toBe(0);
    expect(helpStepIndex(undefined)).toBe(0);
    expect(helpStepIndex('')).toBe(0);
    expect(helpStepIndex('cualquiera')).toBe(0);
  });
});
