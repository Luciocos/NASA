import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TerritorialChecks } from './territory.types';

/** Cliente de los chequeos territoriales. Cada chequeo que escriba agrega su método acá. */
@Service()
export class TerritoryApi {
  private readonly http = inject(HttpClient);

  checks(lotId: number): Observable<TerritorialChecks> {
    return this.http.get<TerritorialChecks>(`/api/lots/${lotId}/territorial-checks/`);
  }
}
