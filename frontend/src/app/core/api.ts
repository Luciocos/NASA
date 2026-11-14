import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  EventFilters,
  EventLog,
  EventLogItem,
  EventReview,
  Health,
  LotCreate,
  LotDetail,
  LotSummary,
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
}
