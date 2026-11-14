# Reparto del trabajo

El repositorio es un monorepo separado por funcionalidad. Los tres devs trabajan **al mismo tiempo**: cada uno es dueño de una funcionalidad de punta a punta y nadie espera a otro para arrancar.

Los nombres Dev A, B y C son provisorios: reemplazarlos por los nombres del equipo.

## Lo que ya está hecho (base común)

Esto ya está en `main`, así que nadie depende de que otro lo termine:

- **Modelos y migraciones** de todas las apps: `Lot`, `Campaign`, `Event`, `InputRecord` y `Passport` (CLAUDE.md, sección 7).
- **Comando `import_events`**, con validación del contrato y pruebas.
- **Cuatro lotes reales** en `data/demo/lote1.json` a `lote4.json`, generados por el pipeline con NISAR y HLS (el lote simulado de desarrollo ya se borró). Detalle del método y resultados en `pipeline/README.md`.
- **Tipos de TypeScript** de esos modelos en `frontend/src/app/core/models.ts`.
- **Componentes compartidos** `origin-badge` y `simulated-notice`.

Para tener los lotes en la base:

```bash
cd backend
python manage.py migrate
python manage.py import_events ../data/demo/*.json --replace
```

## Tres líneas en paralelo

### Dev A: datos satelitales

Trabaja contra el contrato JSON (CLAUDE.md, sección 8), que ya está fijo. No necesita nada de Dev B ni de Dev C.

| Carpeta | Tarea |
|---|---|
| `pipeline/` | Notebooks y scripts de teledetección (NISAR, HLS, FIRMS). |
| `data/demo/` | Un JSON por lote real. Se valida con `import_events`. |
| `data/evidence/` | PNG livianos de evidencia (radar y óptico). |

Los lotes reales ya están en `data/demo/`. Para regenerarlos, ver `pipeline/README.md`.

### Dev B: lotes y bitácora

Trabaja contra los modelos y los lotes de `data/demo/`.

| Carpeta | Tarea |
|---|---|
| `backend/lots/` | Serializers y vistas de `/api/lots/`. |
| `backend/events/` | Bitácora `/api/lots/{id}/events/` y `PATCH /api/events/{id}/`. |
| `frontend/src/app/features/map/` | Mapa de lotes con Leaflet. |
| `frontend/src/app/features/lot/` | Ficha, bitácora y comparación radar contra óptico. |

### Dev C: huella y pasaporte

Lee los modelos directamente desde su propio código. No consume la API de Dev B.

| Carpeta | Tarea |
|---|---|
| `backend/carbon/` | Cálculo de huella, simulador, puntaje y pruebas con `pytest`. |
| `backend/carbon/factors.yaml` | Factores de emisión. Solo con fuente verificada. |
| `backend/passports/` | Enlace público y vista de solo lectura. |
| `frontend/src/app/features/footprint/` | Pantallas de huella y simulador. |
| `frontend/src/app/features/passport/` | Vista pública imprimible. |

## Por qué no se pisan

- **Carpetas separadas:** cada dev edita solo sus apps de Django y sus features de Angular.
- **Rutas separadas:** cada app tiene su `urls.py` y cada feature su `*.routes.ts`. Los archivos raíz ya incluyen a todos.
- **Sin dependencias cruzadas de API:** cada dev escribe el endpoint y la pantalla que lo consume.
- **Datos de prueba propios:** los lotes de `data/demo/` alcanzan para todas las pantallas. Las pruebas de carbono arman sus datos en el propio test.

## Únicos puntos de coordinación

Son pocos. Se avisan en el chat del equipo antes de tocar y van en un commit aparte.

| Qué | Quién decide |
|---|---|
| Contrato de importación (CLAUDE.md, sección 8) | Dev A, con aviso a Dev B |
| Campos de un modelo ya creado | El dueño de la app, con aviso al resto |
| `backend/core/`, `backend/config/` | Entre los tres |
| `frontend/src/app/core/` y `shared/` | Entre los tres |
| Factores de emisión y pesos del puntaje | Dev C propone, el equipo valida la fuente |

## Flujo de git

- **Ramas:** una por tarea, con prefijo del área: `datos/…`, `bitacora/…`, `huella/…`.
- **Integración:** traer `main` y subir seguido, con cambios chicos. Ramas de más de unas horas terminan en conflictos.
- **Migraciones:** cada dev genera migraciones solo de sus apps, después de traer `main`.
- **Commits:** en español, en imperativo, sin atribución a Claude.

## Puntos de integración

Momentos en que las tres líneas se juntan y hay que probar todo junto:

1. Dev A entrega el primer JSON real con sus PNG: Dev B lo importa y revisa la bitácora y la comparación radar contra óptico.
2. Dev B tiene la ficha del lote: se agregan los enlaces a huella y pasaporte de Dev C.
3. Antes de la entrega: recorrida completa de la demo con datos reales.
