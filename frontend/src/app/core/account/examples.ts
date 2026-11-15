import { Lot } from '../models';

/**
 * lotes de ejemplo de la zona: los que dibujó y procesó el pipeline con NISAR y HLS
 * (pipeline/lots.geojson y data/demo). se muestran en toda cuenta demo para que haya datos
 * satelitales reales desde el primer momento
 */
export const EXAMPLE_LOT_NAMES: readonly string[] = ['Lote 1', 'Lote 2', 'Lote 3', 'Lote 4'];

export function isExampleLot(lot: Pick<Lot, 'name'>): boolean {
  return EXAMPLE_LOT_NAMES.includes(lot.name);
}
