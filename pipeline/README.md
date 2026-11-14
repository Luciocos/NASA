# pipeline

Procesamiento satelital offline (Dev A). No forma parte del backend: genera los JSON de `data/demo/` y las imágenes de `data/evidence/`, que después se importan con `import_events`.

## Cómo correrlo

Requisitos: Python 3.13 y una cuenta de Earthdata Login (gratuita, https://urs.earthdata.nasa.gov). Las credenciales van en el `.env` de la raíz (`EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD`), que no se sube al repositorio.

```bash
cd pipeline
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python scripts/search_nisar.py     # lista escenas NISAR GCOV (no requiere login)
python scripts/extract_nisar.py    # recortes HH/HV por lote, sin bajar escenas completas
python scripts/extract_hls.py      # NDVI y recortes ópticos HLS, con máscara de nubes
python scripts/build_demo.py       # detecta eventos y escribe data/demo y data/evidence

cd ../backend
python manage.py import_events ../data/demo/lote*.json --replace
```

Los resultados intermedios quedan en `pipeline/output/`, ignorado por git.

## Datos

| Dato | Producto | Detalle |
|---|---|---|
| Radar | NISAR L2 GCOV (NASA/ISRO, banda L) | Órbita descendente, path 111, frame 105. 10 fechas cada 12 días, del 2026-06-21 al 2026-10-31. Polarizaciones HH y HV, 20 MHz (píxel de 20 m). 9 escenas *provisional* y 1 *validated* (2026-10-31). |
| Óptico | HLS v2.0 (NASA, S30 y L30) | Tile T20HPJ. Se usan las fechas con al menos 90 % del lote despejado según Fmask. |
| Lluvia | NASA POWER (PRECTOTCORR diaria) | Se usa para explicar cambios que afectan a toda la zona. |
| Lotes | `lots.geojson` | 4 lotes dibujados sobre Sentinel-2 L2A del 2026-11-08, 30 m hacia adentro del borde del campo. Sin titular ni RENSPA. |

Las rutas internas del HDF5 se verificaron contra un archivo real: `/science/LSAR/GCOV/grids/frequencyA/HHHH` y `HVHV` (gamma0 en potencia lineal), `mask`, `xCoordinates`, `yCoordinates` y `projection` (EPSG:32720). HLS viene en UTM norte (EPSG:32620) aun en el hemisferio sur, así que se reproyecta para alinearlo con NISAR.

## Método de detección (prueba de concepto, sin validar)

1. **Backscatter del lote:** promedio de gamma0 en potencia lineal sobre los píxeles válidos del polígono, convertido a dB.
2. **Anomalía:** lote menos la mediana del paisaje (todos los recortes) en la misma fecha. Así se separa lo que le pasa al lote de lo que le pasa a toda la zona.
3. **Fechas excluidas:** las fechas en que el HH de todo el paisaje se aparta de su mediana temporal más de 5 veces el desvío absoluto mediano. Hoy queda excluido el 2026-10-07: los 4 lotes suben entre 3 y 6 dB a la vez y NASA POWER registra 46 mm de lluvia ese día (suelo mojado, no manejo).
4. **Umbral:** un cambio de anomalía en HH entre fechas consecutivas es evento si supera 3 veces el desvío de esos cambios en los lotes de referencia (lotes 2 y 4, sin cambios visibles en NDVI) y se mantiene en la fecha siguiente. Hoy el umbral resulta en 1,03 dB.
5. **Tipo de evento:** se usa NDVI de HLS para interpretar. Un cambio de superficie seguido de suba de HV y después de NDVI se registra como siembra.

Los parámetros (3 desvíos, 5 MAD, lotes de referencia) son una propuesta: **el equipo tiene que validarlos** antes de presentarlos como método (CLAUDE.md, sección 18). Por eso el campo `confidence` de los eventos va en `null` y las métricas incluyen `threshold_validated: false`.

## Resultados actuales

| Lote | Radar NISAR | NDVI HLS | En la base |
|---|---|---|---|
| 1 (23 ha) | Sin cambio brusco. HV sube gradualmente desde agosto. | De 0,3 en junio a 0,85 en agosto, baja a 0,76 a fines de octubre. | Campaña 2026/27, cultivo "Otro", VERIFIED: hubo un cultivo de invierno, sin identificar la especie. Sin eventos. |
| 2 (37 ha) | Estable. | Estable en 0,24–0,30. | Sin campañas ni eventos (barbecho). |
| 3 (87 ha) | HH baja 1,78 dB frente al paisaje entre 2026-09-01 y 2026-09-13 y se mantiene; HV sube. | Estable en 0,23–0,25 hasta fines de septiembre, 0,34 el 2026-10-31. | Evento SOWING, NISAR, VERIFIED, 2026-09-07 ± 6 días. Campaña 2026/27, maíz ESTIMATED (por calendario regional). |
| 4 (39 ha) | Estable. | Estable en 0,23–0,34. | Sin campañas ni eventos (barbecho). |

## Hipótesis y límites

- **Lote 3:** la caída de HH es compatible con un cambio de rugosidad por la sembradora (o una labranza previa, que no se puede descartar). La suba de HV antes que la de NDVI sugiere que el radar ve la estructura del cultivo temprano antes que el óptico. Hay que confirmarlo en campo.
- **Lote 1:** HV en banda L sube poco con un cultivo de invierno denso (NDVI 0,85). Es esperable: la banda L penetra la canopia de cultivos bajos. No se detecta una fecha de siembra porque fue antes de junio.
- **Lluvia:** un evento de 46 mm cambia más el backscatter que cualquier práctica de manejo. Sin la corrección de paisaje, el pipeline lo confundiría con eventos.
- **Madurez de los datos:** 9 de 10 escenas son *provisional*. La guía de NISAR recomienda no mezclar madurez sin cuidado; acá se mezcla una sola escena *validated* al final de la serie.
