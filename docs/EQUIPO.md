# Reparto del trabajo

El repositorio es un monorepo separado por funcionalidad. Cada dev es dueño de una funcionalidad de punta a punta (datos, backend y frontend), para poder trabajar en paralelo sin pisarse.

Los nombres Dev A, B y C son provisorios: reemplazarlos por los nombres del equipo.

## Dev A: datos satelitales

Produce los eventos que alimentan todo el producto.

| Carpeta | Qué hay |
|---|---|
| `pipeline/` | Notebooks y scripts de teledetección (NISAR, HLS, FIRMS). Offline. |
| `data/demo/` | Un JSON por lote, con el formato de CLAUDE.md, sección 8. |
| `data/evidence/` | PNG livianos de evidencia (radar y óptico). |
| `backend/events/management/commands/import_events.py` | Comando que valida e importa los JSON. |

Primera entrega: un JSON de ejemplo en `data/demo/` con un lote y un evento, aunque sea `is_simulated: true`. Con eso Dev B y Dev C pueden avanzar.

## Dev B: lotes y bitácora

Pasos 2 a 5 de CLAUDE.md: la demo mínima.

| Carpeta | Qué hay |
|---|---|
| `backend/lots/` | Modelos `Lot` y `Campaign`, API `/api/lots/`. |
| `backend/events/` | Modelo `Event`, API de bitácora y `PATCH /api/events/{id}/`. |
| `frontend/src/app/features/map/` | Pantalla de mapa con Leaflet. |
| `frontend/src/app/features/lot/` | Ficha del lote, bitácora y comparación radar contra óptico. |

Primera entrega: los modelos `Lot`, `Campaign` y `Event` con su migración. Dev A y Dev C dependen de ellos.

## Dev C: huella y pasaporte

Pasos 6 a 8 de CLAUDE.md.

| Carpeta | Qué hay |
|---|---|
| `backend/carbon/` | Modelo `InputRecord`, cálculo de huella, simulador, puntaje y pruebas con `pytest`. |
| `backend/carbon/factors.yaml` | Factores de emisión. Solo con fuente verificada. |
| `backend/passports/` | Modelo `Passport` y enlace público. |
| `frontend/src/app/features/footprint/` | Pantallas de huella y simulador. |
| `frontend/src/app/features/passport/` | Vista pública imprimible. |

El módulo de carbono se puede escribir y probar antes de tener eventos reales: las pruebas usan datos armados en el propio test.

## Código compartido

Estas partes las usa todo el equipo. Se cambian avisando al resto y en un commit aparte.

- `backend/core/`: enum `Origin` y chequeo de salud.
- `backend/config/`: settings y rutas raíz.
- `frontend/src/app/core/`: cliente HTTP y tipos compartidos.
- `frontend/src/app/shared/`: `origin-badge` y `simulated-notice`.
- `frontend/src/app/app.routes.ts`, `docker-compose.yml`, `.env.example`, `CLAUDE.md`.
- El contrato de importación (CLAUDE.md, sección 8): lo acuerdan Dev A y Dev B.

## Cómo no pisarse

- **Rutas:** cada app de Django tiene su `urls.py` y cada feature de Angular su `*.routes.ts`. No hace falta tocar los archivos raíz para sumar un endpoint o una pantalla.
- **Migraciones:** cada dev genera migraciones solo de sus apps. Antes de generarlas, traer los cambios de `main`.
- **Ramas:** una por tarea, con prefijo del área: `datos/…`, `bitacora/…`, `huella/…`. Integrar a `main` seguido, con cambios chicos.
- **Commits:** en español, en imperativo, sin atribución a Claude.
