# Capa: distancias de exclusión periurbanas

Datos del chequeo `periurban` (`backend/territory/checks/periurban.py`). Es un cruce indicativo: no reemplaza asesoramiento legal ni el límite oficial de la planta urbana.

## Archivos

| Archivo | Contenido | Fuente | Fecha | Licencia |
|---|---|---|---|---|
| `rules.yaml` | Norma, artículo y distancias (terrestre y aérea) por localidad | Ley provincial de Santa Fe N° 11.273 (ver abajo) | Ley sancionada el 28/09/1995; leída el 15/11/2026 | Texto normativo público |
| `urban_areas.geojson` | Áreas urbanas aproximadas (EPSG:4326) de Casilda, Chabás, Fuentes, Los Molinos, Pujato y Sanford | OpenStreetMap, `landuse=residential`, vía Overpass API | Descargado el 15/11/2026 | ODbL 1.0, © OpenStreetMap contributors |

## Norma verificada

Ley provincial de Santa Fe N° 11.273 de Productos Fitosanitarios. Texto leído en el PDF del sitio oficial de la provincia:
https://santafe.gob.ar/index.php/web/content/download/3686/21012/file/LEY%2011273.pdf

- **Art. 33 (aérea):** prohíbe la aplicación aérea de productos de clase toxicológica A y B dentro del radio de 3.000 metros de las plantas urbanas. Admite excepciones por ordenanza para clases C y D dentro de los 500 m y para clase B entre los 500 y 3.000 m.
- **Art. 34 (terrestre):** prohíbe la aplicación terrestre de productos de clase toxicológica A y B dentro del radio de 500 metros de las plantas urbanas. Las clases C y D se pueden aplicar dentro de ese radio conforme a la reglamentación.
- **Ley 11.354 (1995):** modifica los arts. 11, 17 y 19, no los 33 y 34.
- **Decreto 552/97, arts. 51 a 53:** reglamenta las excepciones. El art. 52 dice que cada municipio o comuna delimita su planta urbana por ordenanza.

## Qué no se pudo verificar

- **Ordenanza de Casilda:** no se encontró una ordenanza municipal con distancias propias para aplicar fitosanitarios. Se usa el marco provincial. Si aparece una ordenanza, se carga en `ordenanza_municipal` y, si fija otras distancias, en la localidad correspondiente.
- **Límite oficial de la planta urbana:** no está disponible como capa. Se aproxima con OSM. En Casilda la mayor parte del área sale de la relación OSM 5532619 ("Zona urbana de Casilda"), cargada por usuarios de OSM. No se contrastó con la ordenanza de zonificación.
- **Fallos judiciales:** algunos casos puntuales fijaron distancias mayores (por ejemplo, San Jorge y Piamonte). No se aplican acá.

## Cómo se regenera

```bash
cd pipeline && source .venv/bin/activate
python scripts/build_layer_periurban.py
```

La respuesta cruda de Overpass queda en `pipeline/output/periurban_raw/`, que git ignora. Parámetros geométricos del script (no vienen de la norma):

- unión con un cierre de 50 m para soldar manzanas;
- un área se asigna a un nodo `place` si está a 1.500 m o menos;
- simplificación de 10 m.
