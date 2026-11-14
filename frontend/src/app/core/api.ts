import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  DeclarationRequest,
  EventFilters,
  EventLog,
  EventLogItem,
  EventReview,
  Footprint,
  Health,
  LotCreate,
  LotDetail,
  LotSummary,
  PassportLink,
  PublicPassport,
  SimulationRequest,
  SimulationResult,
  SustainabilityScore,
} from './models';

/** Cliente HTTP del backend. Las rutas /api/ pasan por el proxy de ng serve. */
@Service()
export class Api {
  private readonly http = inject(HttpClient);

  health(): Observable<Health> {
    return this.http.get<Health>('/api/health/');
  }

  // Lotes y bitácora (Dev B).

  lots(): Observable<LotSummary[]> {
    return this.http.get<LotSummary[]>('/api/lots/');
  }

  lot(id: number): Observable<LotDetail> {
    return this.http.get<LotDetail>(`/api/lots/${id}/`);
  }

  createLot(body: LotCreate): Observable<LotDetail> {
    return this.http.post<LotDetail>('/api/lots/', body);
  }

  lotEvents(lotId: number, filters: EventFilters = {}): Observable<EventLog> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '' && value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<EventLog>(`/api/lots/${lotId}/events/`, { params });
  }

  reviewEvent(eventId: number, body: EventReview): Observable<EventLogItem> {
    return this.http.patch<EventLogItem>(`/api/events/${eventId}/`, body);
  }

  // Huella, puntaje, simulador y pasaporte (Dev C).

  /** campaign es el id o la etiqueta de la campaña; null usa la última del lote. */
  footprint(lotId: number, campaign: number | string | null = null): Observable<Footprint> {
    let params = new HttpParams();
    if (campaign !== null && campaign !== '') {
      params = params.set('campaign', String(campaign));
    }
    return this.http.get<Footprint>(`/api/lots/${lotId}/footprint/`, { params });
  }

  score(lotId: number): Observable<SustainabilityScore> {
    return this.http.get<SustainabilityScore>(`/api/lots/${lotId}/score/`);
  }

  /** El productor declara rendimiento e insumos. Responde la huella recalculada. */
  declare(lotId: number, body: DeclarationRequest): Observable<Footprint> {
    return this.http.post<Footprint>(`/api/lots/${lotId}/declaration/`, body);
  }

  /** Simulación: el backend no guarda nada. */
  simulate(lotId: number, body: SimulationRequest): Observable<SimulationResult> {
    return this.http.post<SimulationResult>(`/api/lots/${lotId}/simulate/`, body);
  }

  createPassport(lotId: number): Observable<PassportLink> {
    return this.http.post<PassportLink>(`/api/lots/${lotId}/passport/`, {});
  }

  passport(token: string): Observable<PublicPassport> {
    return this.http.get<PublicPassport>(`/api/passports/${token}/`);
  }
}
