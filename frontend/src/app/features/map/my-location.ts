/** un punto [lat, lng] en grados */
export interface Spot {
  lat: number;
  lng: number;
}

/** el permiso o la ubicación fallaron: el mensaje ya está listo para mostrar */
export class LocationError extends Error {}

const TIMEOUT_MS = 15_000;
// una ubicación de hace unos minutos sirve igual para encontrar el campo
const MAX_AGE_MS = 5 * 60_000;

/**
 * pide la ubicación del dispositivo una sola vez, para llevar el mapa cerca del campo. no se
 * guarda en ningún lado: solo mueve el mapa (y viaja en la dirección de la pantalla de alta)
 *
 * rechaza con LocationError y un mensaje en lenguaje llano si no hay permiso, si el navegador no
 * la comparte o si tarda demasiado
 */
export function locateOnce(geolocation: Geolocation | undefined): Promise<Spot> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(
        new LocationError('Este navegador no comparte la ubicación. Buscá tu campo en el mapa.'),
      );
      return;
    }
    geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(new LocationError(describeLocationError(error))),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  });
}

// códigos de GeolocationPositionError: 1 sin permiso, 2 sin ubicación, 3 se agotó el tiempo
function describeLocationError(error: Pick<GeolocationPositionError, 'code'>): string {
  if (error.code === 1) {
    return 'No nos diste permiso para ver tu ubicación. No pasa nada: buscá tu campo en el mapa.';
  }
  if (error.code === 3) {
    return 'Tu ubicación tardó demasiado. Probá de nuevo o buscá tu campo en el mapa.';
  }
  return 'No pudimos saber dónde estás. Buscá tu campo en el mapa.';
}

/** lee lat y lng de la dirección; null si faltan o no son coordenadas válidas */
export function spotFromParams(lat: string | null, lng: string | null): Spot | null {
  if (lat === null || lng === null || lat.trim() === '' || lng.trim() === '') return null;
  const spot = { lat: Number(lat), lng: Number(lng) };
  const valid =
    Number.isFinite(spot.lat) &&
    Number.isFinite(spot.lng) &&
    Math.abs(spot.lat) <= 90 &&
    Math.abs(spot.lng) <= 180;
  return valid ? spot : null;
}

/** coordenada redondeada para la dirección: 5 decimales son un metro, de sobra para el mapa */
export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}
