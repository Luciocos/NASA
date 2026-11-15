import { Injector, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { LocalFrame } from './geo/local-frame';
import { formatHectares, lastEvent, latestCampaign } from './insights';
import { Api } from './api';
import { CampaignDetail, EventLogItem, LotSummary } from './models';
import { describeLotVisual } from '../shared/iso/lot-visual';
import { geometryToIsoRings, isoFrameFor } from '../shared/iso/geo-bridge';
import { IsoLot, IsoLotStatus } from '../shared/iso/model';
import { PendingLot } from './offline/lot-outbox';

/** lo que se sabe de un lote para dibujarlo y resumirlo en el mapa */
export interface LotOverview {
  lot: LotSummary;
  /** campañas de la ficha; null si no se pudieron leer */
  campaigns: CampaignDetail[] | null;
  /** último evento de la bitácora; null si no hay o no se pudo leer */
  last: EventLogItem | null;
  /** bitácora completa, ordenada por fecha; vacía si no hay o no se pudo leer */
  events: EventLogItem[];
}

/** ficha y bitácora de cada lote, en paralelo. un lote que falla queda con lo que se sabe */
export function loadOverviews(api: Api, lots: LotSummary[]): Observable<LotOverview[]> {
  if (lots.length === 0) return of([]);
  return forkJoin(
    lots.map((lot) =>
      forkJoin({
        detail: api.lot(lot.id).pipe(catchError(() => of(null))),
        log: api.lotEvents(lot.id).pipe(catchError(() => of(null))),
      }).pipe(
        map(({ detail, log }) => ({
          lot,
          campaigns: detail?.campaigns ?? null,
          events: log?.events ?? [],
          last: lastEvent(log?.events ?? []),
        })),
      ),
    ),
  );
}

/** un lote del backend como bloque de la maqueta, en el marco dado */
export function isoLotFor(
  frame: LocalFrame,
  { lot, campaigns, last }: LotOverview,
  status: IsoLotStatus = 'normal',
): IsoLot {
  const visual = describeLotVisual({
    crop: latestCampaign(campaigns ?? [])?.crop ?? null,
    lastEvent: last
      ? { type: last.type, origin: last.origin, isSimulated: last.is_simulated }
      : null,
  });
  return {
    id: String(lot.id),
    label: lot.name,
    sublabel: formatHectares(lot.area_ha),
    rings: geometryToIsoRings(frame, lot.geometry),
    cover: visual.cover,
    crop: visual.crop,
    marker: visual.marker,
    status,
  };
}

/** un lote guardado solo en el dispositivo (sin sincronizar), con su globo de "pendiente" */
export function pendingIsoLot(frame: LocalFrame, pending: PendingLot): IsoLot {
  return {
    id: `pendiente:${pending.localId}`,
    label: pending.body.name,
    sublabel: 'Sin sincronizar',
    rings: geometryToIsoRings(frame, pending.body.geometry),
    cover: 'bare',
    marker: { glyph: 'PENDING', tone: 'neutral' },
    status: 'pending',
  };
}

/** maqueta de un conjunto de lotes: un marco métrico común y un IsoLot por lote */
export function buildIsoScene(
  overviews: readonly LotOverview[],
  pending: readonly PendingLot[] = [],
): { frame: LocalFrame | null; lots: IsoLot[] } {
  const frame = isoFrameFor([
    ...overviews.map((item) => item.lot.geometry),
    ...pending.map((item) => item.body.geometry),
  ]);
  if (!frame) return { frame: null, lots: [] };
  return {
    frame,
    lots: [
      ...overviews.map((item) => isoLotFor(frame, item)),
      ...pending.map((item) => pendingIsoLot(frame, item)),
    ],
  };
}

/** señal con el resumen de una lista de lotes que llega como observable */
export function overviewsSignal(
  source: Observable<LotSummary[]>,
  injector = inject(Injector),
): Signal<LotOverview[] | null | undefined> {
  const api = injector.get(Api);
  return toSignal(
    source.pipe(
      switchMap((lots) => loadOverviews(api, lots)),
      catchError(() => of(null)),
    ),
    { initialValue: undefined, injector },
  );
}
