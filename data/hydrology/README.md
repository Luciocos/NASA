# Cuenca y Caudal: datos del Lote 3

Datos para la pestaña **Cuenca y Caudal** de LoTestigo. Los genera el pipeline offline y el backend (`backend/hydrology/`) solo los lee. El backend no procesa imágenes ni el DEM.

## Cómo regenerarlos

```bash
cd pipeline
python scripts/hydrology_terrain.py   # DEM, OSM, relleno, D8, acumulación, TWI y capas PNG
python scripts/hydrology_forcing.py   # IMERG, SMAP, MOD16, MCD12Q1 y SoilGrids
```

`hydrology_forcing.py` necesita `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en el `.env`, y la app "NASA GESDISC DATA ARCHIVE" autorizada en la cuenta de Earthdata. Las descargas intermedias quedan en `pipeline/output/hydrology_raw/`, que no se sube al repositorio.

## Archivos

| Archivo | Contenido |
|---|---|
| `lote3/terrain.npz` | Grillas de la ventana de 0,18° × 0,20° alrededor del lote (1 segundo de arco): DEM, dirección D8 con y sin cursos de OSM, acumulación de flujo (m²), pendiente, TWI y profundidad de relleno. |
| `lote3/terrain.json` | Ventana, fuentes, métodos y parámetros de modelado. |
| `lote3/osm_waterways.geojson` | Canales, zanjas, desagües, arroyos y ríos de OpenStreetMap (ODbL). |
| `lote3/landcover.npz` | Cobertura MODIS MCD12Q1 (IGBP) del último año, llevada a la grilla del DEM. |
| `lote3/forcing.json` | Lluvia IMERG diaria 2020–2026 (bloque de 3 × 3 celdas de 0,1°), eventos cada 30 min con SMAP previo, ET MOD16 de 8 días y textura SoilGrids. |
| `lote3/*.png` | Capas para el mapa: acumulación de flujo, TWI y bajos del DEM. Solo sirven para ver; los números salen de las grillas. |

## Fuentes

| Dato | Producto | Acceso |
|---|---|---|
| Relieve | Copernicus DEM GLO-30 (DSM) | AWS Open Data, sin login |
| Cursos de agua | OpenStreetMap | Overpass API |
| Lluvia | NASA GPM IMERG V07: diaria Final (`GPM_3IMERGDF`) y Late (`GPM_3IMERGDL`); cada media hora Final (`GPM_3IMERGHH`) y Late (`GPM_3IMERGHHL`) | Earthdata (OPeNDAP) |
| Humedad del suelo | NASA SMAP L3 `SPL3SMP_E` (9 km, pasada de la mañana o, si no hay, de la tarde) | Earthdata (OPeNDAP) |
| Evapotranspiración | NASA MODIS `MOD16A2GF` (hasta 2025) y `MOD16A2` (2026) | ORNL DAAC |
| Cobertura | NASA MODIS `MCD12Q1` LC_Type1 (IGBP), 500 m | ORNL DAAC |
| Textura del suelo | ISRIC SoilGrids 2.0, 0–30 cm | REST API |

## Modelo

1. **Terreno:** relleno Priority-Flood+ε (Barnes, Lehman y Mulla 2014), D8 por máxima pendiente, acumulación de flujo y TWI = ln(a / tan β) (Beven y Kirkby 1979).
   - Los cursos de OSM se "queman" 3 m en el DEM para que el flujo los siga. Es un criterio de modelado, no una profundidad.
   - La cuenca también se calcula sin OSM, para mostrar cuánto depende de esa decisión.
2. **Cuenca:** desde el punto de salida se recorre la red D8 hacia aguas arriba.
   - Un clic en el mapa se ajusta a la celda de mayor acumulación a 3 celdas o menos.
   - La "cuenca que aporta al lote" es todo lo que escurre hacia alguna celda del lote.
3. **Escorrentía:** SCS-CN, con Q calculado por cobertura y ponderado por superficie.
   - Números de curva de TR-55, Tablas 2-2a, 2-2b y 2-2c.
   - Grupo hidrológico según la textura (TR-55, Apéndice A).
   - Condición antecedente según NEH 630 cap. 10, Tabla 10-1.
   - Cada evento se calcula en ARC II, con el rango de ARC I a ARC III.
4. **Caudal:** hidrograma unitario adimensional SCS (NEH 630 cap. 16, Tabla 16-1, factor de pico 484).
   - Retardo de Mockus (NEH 630 cap. 15, ec. 15-4a).
   - Paso de cálculo de 0,2 Tp o menos.

Los valores y su fuente están en `backend/hydrology/parameters.yaml`.

## Validación y límites

- **No hay caudales ni niveles medidos en la cuenca.** No se pueden calcular NSE, RMSE, MAE, sesgo de volumen ni error de pico. Todo resultado es una simulación sin validar.
- **No se entrenó un modelo de aprendizaje automático** (XGBoost ni Random Forest): sin observaciones no hay con qué entrenarlo ni validarlo. Si se instala un limnímetro o se registran niveles en la salida, el historial de eventos ya está armado para calibrar con eventos separados en el tiempo.
- **DEM:** el Copernicus DEM es un modelo de superficie de 30 m. En la llanura, su error vertical es del mismo orden que los desniveles. La divisoria y los cauces del modelo hay que contrastarlos en el campo.
- **Infraestructura:** caminos, terraplenes y alcantarillas no mapeados en OSM no están en el modelo.
- **Lluvia:**
  - IMERG tiene celdas de unos 10 km y la versión Late es preliminar.
  - La versión Final llega hasta septiembre de 2025.
  - Los eventos se eligen con al menos 20 mm en un día en la celda del lote. Es un criterio de selección para acotar la descarga.
- **Humedad del suelo:** SMAP (9 km) y la lluvia de 5 días previos se muestran como contexto. NEH 630 cap. 10 advierte que la lluvia previa explica mal la variación del CN, por eso no se usa para elegir la condición antecedente.
- **Caudal pico:** el factor 484 probablemente sobreestima el pico en la llanura (NEH 630 cap. 16 cita unos 300 en terreno muy plano).
- **Acumulación:** las zonas de acumulación son susceptibilidad topográfica relativa, no una simulación hidráulica de anegamiento.
- **GRACE-FO y ECOSTRESS:** no se usaron.
  - GRACE-FO solo serviría como contexto regional.
  - ECOSTRESS tiene pasadas irregulares y no se integró a tiempo.
