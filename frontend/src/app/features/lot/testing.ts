import { EventLogItem } from '../../core/models';

/** Evento armado para las pruebas: no representa una observación real. */
export function makeEvent(overrides: Partial<EventLogItem> = {}): EventLogItem {
  return {
    id: 1,
    lot: 1,
    campaign: 10,
    campaign_label: '2025/26',
    type: 'TILLAGE',
    type_label: 'Remoción de suelo',
    date: '2026-10-12',
    date_uncertainty_days: 12,
    sensor: 'MANUAL',
    sensor_label: 'Manual',
    origin: 'ESTIMATED',
    confidence: null,
    evidence_image: '',
    evidence_image_url: null,
    evidence_optical_image: '',
    evidence_optical_image_url: null,
    metrics: {},
    is_simulated: true,
    notes: '',
    ...overrides,
  };
}
