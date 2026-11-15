import { GibsCatalog } from './gibs';
import { NasaHttp, type NasaHttpOptions } from './http';
import { ModisClient } from './modis';
import { PowerClient } from './power';
import { SceneCatalog } from './scenes';

export interface NasaClients {
  power: Pick<PowerClient, 'daily'>;
  modis: Pick<ModisClient, 'ndviBatch' | 'landCover'>;
  scenes: Pick<SceneCatalog, 'nisarScenes' | 'hlsScenes'>;
  gibs: GibsCatalog;
  now: () => number;
}

/** arma los clientes sobre un mismo acceso a red (sirve también fuera de Angular) */
export function createNasaClients(options: NasaHttpOptions = {}): NasaClients & {
  http: NasaHttp;
  power: PowerClient;
  modis: ModisClient;
  scenes: SceneCatalog;
} {
  const now = options.now ?? (() => Date.now());
  const http = new NasaHttp({ ...options, now });
  return {
    http,
    power: new PowerClient(http, now),
    modis: new ModisClient(http, now),
    scenes: new SceneCatalog(http),
    gibs: new GibsCatalog(http),
    now,
  };
}
