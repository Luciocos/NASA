import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SimulationRequest, WaterAnalysis, WaterHistory, WaterSimulation } from './water.types';

/** punto de salida elegido en el mapa; sin punto, el backend usa la salida principal del lote */
export interface OutletPick {
  lat: number;
  lng: number;
}

function outletParams(outlet: OutletPick | null): HttpParams {
  let params = new HttpParams();
  if (outlet) params = params.set('lat', outlet.lat).set('lng', outlet.lng);
  return params;
}

/** Cliente de Cuenca y Caudal. Todo es de lectura: el simulador no guarda nada. */
@Service()
export class WaterApi {
  private readonly http = inject(HttpClient);

  analysis(lotId: number, outlet: OutletPick | null): Observable<WaterAnalysis> {
    return this.http.get<WaterAnalysis>(`/api/lots/${lotId}/hydrology/`, {
      params: outletParams(outlet),
    });
  }

  history(lotId: number, outlet: OutletPick | null): Observable<WaterHistory> {
    return this.http.get<WaterHistory>(`/api/lots/${lotId}/hydrology/history/`, {
      params: outletParams(outlet),
    });
  }

  simulate(lotId: number, body: SimulationRequest): Observable<WaterSimulation> {
    return this.http.post<WaterSimulation>(`/api/lots/${lotId}/hydrology/simulate/`, body);
  }
}
