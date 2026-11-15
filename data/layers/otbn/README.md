# Capa OTBN de Santa Fe (recorte)

Archivo: `otbn_santa_fe.geojson` (EPSG:4326, orden lon/lat). Lo usa el chequeo territorial `otbn` (`backend/territory/checks/otbn.py`).

## Fuente

- **Capa:** Ordenamiento Territorial de Bosques Nativos (OTBN) de la provincia de Santa Fe, en el marco de la Ley 26.331. Fue aprobado por la Ley provincial 13.372 y actualizado por el Decreto 1.690 del 12/09/2022. La Autoridad Local de Aplicación lo entregó a la Autoridad Nacional de Aplicación.
- **Organismo:** Ministerio de Ambiente de la Nación, IDE Ambiental (SInIA).
- **Servicio:** WFS `https://geo.ambiente.gob.ar/geoserver/wfs`, capa `bosques:SF_2022_OTBN` (72.603 polígonos en toda la provincia).
- **Licencia:** el geoservicio declara en `AccessConstraints` "Creative Conmons. Esta licencia es una licencia libre" (textual). No especifica la variante de Creative Commons.
- **Fecha de descarga:** 2026-11-15.

## Qué se recortó y simplificó

- **Recorte:** rectángulo del sur de Santa Fe, lat -33,8 a -32,3 y lon -62,3 a -60,3, alrededor de los lotes demo de Casilda. Quedaron 1.510 polígonos: 1.135 de categoría I y 375 de categoría II. El rectángulo queda guardado en `properties.clip_bbox_lat_lon`. Si un lote cae fuera de esa zona, el chequeo devuelve "sin dato" en vez de "sin superposición".
- **Simplificación:** tolerancia de 0,00005° (unos 5 m), sin perder la topología. Las coordenadas se redondean a 6 decimales. Se descartan las partes no poligonales que deja `make_valid`.
- **Atributos:**
  - `category`: la categoría normalizada (I, II o III), a partir de `cat_cons`.
  - `source_id`, `clase` y `source_area_ha`: valores originales de la capa.
- Santa Fe solo usa las categorías I (rojo) y II (amarillo). La capa no tiene polígonos de categoría III.

## Regenerar

```bash
cd pipeline
python scripts/build_layer_otbn.py
```

Es un cruce indicativo con una capa pública. No reemplaza la consulta a la autoridad provincial.
