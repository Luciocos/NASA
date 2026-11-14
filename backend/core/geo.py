"""Utilidades de geometría sin PostGIS. Ver CLAUDE.md, sección 4."""

from typing import Any

from pyproj import Geod
from shapely.geometry import shape

_GEOD = Geod(ellps='WGS84')


def validate_polygon(geometry: Any) -> list[str]:
    """Devuelve los errores de un GeoJSON Polygon en EPSG:4326 (lista vacía si es válido)."""
    if not isinstance(geometry, dict) or geometry.get('type') != 'Polygon':
        return ['geometry debe ser un GeoJSON de tipo Polygon']
    try:
        polygon = shape(geometry)
    except Exception:  # noqa: BLE001 - shapely levanta varios tipos según el error
        return ['geometry no tiene coordenadas válidas']
    if polygon.is_empty:
        return ['geometry no tiene coordenadas']
    if not polygon.is_valid:
        return ['geometry no es un polígono válido (se cruza o no cierra)']
    min_lon, min_lat, max_lon, max_lat = polygon.bounds
    if min_lon < -180 or max_lon > 180 or min_lat < -90 or max_lat > 90:
        return ['geometry debe estar en EPSG:4326 (longitud, latitud en grados)']
    return []


def polygon_area_ha(geometry: dict[str, Any]) -> float:
    """Área geodésica de un GeoJSON Polygon en EPSG:4326, en hectáreas."""
    area_m2, _perimeter = _GEOD.geometry_area_perimeter(shape(geometry))
    return abs(area_m2) / 10_000
