import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Health } from './models';

/** Cliente HTTP del backend. Las rutas /api/ pasan por el proxy de ng serve. */
@Service()
export class Api {
  private readonly http = inject(HttpClient);

  health(): Observable<Health> {
    return this.http.get<Health>('/api/health/');
  }
}
