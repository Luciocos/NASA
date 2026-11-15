import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BpaDeclarationRequest } from './bpa/bpa.types';
import { TerritorialCheck, TerritorialChecks } from './territory.types';

/** Cliente de los chequeos territoriales. Cada chequeo que escriba agrega su método acá. */
@Service()
export class TerritoryApi {
  private readonly http = inject(HttpClient);

  checks(lotId: number): Observable<TerritorialChecks> {
    return this.http.get<TerritorialChecks>(`/api/lots/${lotId}/territorial-checks/`);
  }

  /** El dueño declara su adhesión a BPA; devuelve el chequeo 'bpa' actualizado. */
  declareBpa(lotId: number, body: BpaDeclarationRequest): Observable<TerritorialCheck> {
    return this.http.post<TerritorialCheck>(`/api/lots/${lotId}/bpa/`, body);
  }
}
