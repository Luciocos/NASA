# pipeline

Procesamiento satelital offline (Dev A). No forma parte del backend.

- `notebooks/`: exploración y análisis de NISAR, HLS y FIRMS.
- `scripts/`: pasos reproducibles que generan la salida final.

Salida esperada:

- Un JSON por lote en `data/demo/`, con el formato de CLAUDE.md, sección 8.
- PNG livianos de evidencia en `data/evidence/`.

Los archivos crudos (HDF5, GeoTIFF, ZIP) van en `pipeline/raw/` o `data/raw/`, que están ignorados por git. Las credenciales de Earthdata van en `.env`.

Importar al backend:

```bash
cd backend
python manage.py import_events ../data/demo/*.json
```
