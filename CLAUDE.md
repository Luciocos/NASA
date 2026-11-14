# Contexto del proyecto: NASA Space Apps Challenge 2026, "Dancing with the SARs"

## Desafío
Proyecto para el desafío "Dancing with the SARs" del NASA Space Apps Challenge 2026 (área Earth Science, dificultad intermedia/avanzada).

Objetivo: construir una aplicación interactiva y open source que use datos de radar de la misión NISAR (NASA-ISRO Synthetic Aperture Radar) para detectar, seguir y visualizar uno o más tipos de cambio en la superficie terrestre en una zona de estudio elegida.

El resultado tiene que convertir observaciones de radar complejas en información accionable y entendible para un público amplio (científicos, gestores de recursos, docentes, tomadores de decisiones y público general).

## Entregable esperado
- Aplicación interactiva: mapas de detección de cambios, animaciones de series temporales, dashboards, sliders antes/después, web maps o story map.
- Hipótesis sobre los drivers físicos o humanos de los cambios observados (o de su ausencia).
- Análisis de qué polarizaciones resaltan mejor el fenómeno.
- Propuesta de aplicaciones futuras de NISAR.

## Consideraciones opcionales del desafío
- Comparar polarizaciones y/o frecuencias de otros sensores SAR.
- Series temporales con múltiples fechas.
- Datos auxiliares para contextualizar (población, tipo de vegetación, imágenes ópticas, capas GIS).
- Mostrar el impacto de actividades humanas (agricultura, industria, etc.).
- Storytelling basado en visualización de datos.
- Contexto local si la zona es conocida por el equipo.

## Fundamentos técnicos de SAR
- SAR es teledetección activa en microondas: emite pulsos y mide el backscatter. Funciona de día, de noche y con nubes.
- Sensible principalmente a la rugosidad (estructura, geometría) y a la constante dieléctrica (agua, humedad del suelo, inundación).
- Las polarizaciones (HH, HV, VV, VH) dan información distinta sobre los mecanismos de dispersión: superficial, volumétrica (vegetación) y doble rebote (estructuras, vegetación inundada).
- Con interferometría (InSAR) se miden deformaciones del orden de centímetros (terremotos, subsidencia, glaciares).
- NISAR opera en banda L (NASA) y banda S (ISRO).

## Fenómenos candidatos
Humedales y llanuras de inundación, deforestación, incendios forestales, cambios en cultivos, humedad del suelo, glaciares y hielo marino, terremotos, subsidencia costera.

## Fuentes de datos
### NASA
- ASF Data Search Vertex (https://search.asf.alaska.edu/): fuente principal de datos NISAR.
- NASA Earthdata Search (https://search.earthdata.nasa.gov/search): catálogo general, también para datos auxiliares.
- NISAR Data User Guide (https://nisar-docs.asf.alaska.edu/): documentación de productos, formatos y uso. Consultar antes de elegir el tipo de producto.
- Intro to SAR (https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar)
- Intro to Remote Sensing (https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing)
- NASA ARSET Trainings (https://appliedsciences.nasa.gov/get-involved/training): incluye material de SAR y NISAR en español.
- NISAR StoryMaps (https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/): referencia del tipo de entregable.
- NISAR Applications White Papers (https://nisar.jpl.nasa.gov/applications/societal-benefit/)
- UAVSAR Postcards (https://uavsar.jpl.nasa.gov/education/postcards.html): referencia de composiciones en falso color.
- Acceso a datos NASA/ASF requiere cuenta de Earthdata Login.

### Otras agencias
- CSA, RADARSAT Constellation Mission (banda C): https://donnees-data.asc-csa.gc.ca/en/dataset/rcm
- CSA, RADARSAT-1 (archivo histórico desde 1995, licencia abierta): https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1
- CSA, tutorial SAR en Python y QGIS: https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial
- CONAE, catálogo SAOCOM (banda L, comparable con NISAR): https://catalogos.conae.gov.ar/catalogo/catalogoSatSaocomInfo.html
- Registro SAOCOM (perfil ONE CLICK): https://www.argentina.gob.ar/noticias/la-informacion-saocom-cada-vez-mas-accesible

## Definiciones del proyecto (completar)
- Zona de estudio: [COMPLETAR]
- Fenómeno a analizar: [COMPLETAR]
- Rango de fechas: [COMPLETAR]
- Productos NISAR a usar: [COMPLETAR, según NISAR Data User Guide]
- Datos auxiliares: [COMPLETAR]
- Formato de presentación: [COMPLETAR]
- Fecha límite de entrega: [COMPLETAR]

## Stack (propuesto, a confirmar)
- Python para descarga y procesamiento (asf_search / earthaccess para acceso, xarray, rasterio, h5py, numpy).
- QGIS para inspección manual.
- Frontend interactivo: [COMPLETAR, por ejemplo Streamlit, leafmap o una web con Leaflet/MapLibre].

## Reglas de trabajo
- Todo el código y la documentación deben ser open source.
- No inventar datos ni resultados: toda afirmación sobre la zona o el fenómeno tiene que estar respaldada por los datos procesados o por una fuente citada.
- Verificar formatos y nombres de productos contra la NISAR Data User Guide antes de escribir código de lectura.
- No commitear credenciales de Earthdata ni datos crudos pesados al repositorio.
