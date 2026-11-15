# LoTestigo

Guía de proyecto para Claude Code. Leer completa antes de escribir código.

## 1. Contexto

- Proyecto del NASA Space Apps Challenge 2026, sede Rosario. Hackathon de 48 horas.
- Desafío oficial elegido: visualización de datos de radar NISAR y detección de cambios en la superficie.
- Desafío local: AgTech para la Zona Núcleo, junto a AFA (Agricultores Federados Argentinos).
- Plazos: el repositorio debe estar en GitHub el domingo 15/11/2026 a las 15:00. La entrega final cierra ese día a las 23:59.
- Consecuencia: se prioriza una demo que funcione de punta a punta sobre pocos lotes. No se construye para producción.

## 2. Producto

**LoTestigo** es una bitácora de eventos de manejo de un lote agrícola, detectados por satélite (radar NISAR de la NASA como sensor principal). Sobre esa bitácora se calcula una huella de carbono estimada y se ofrece un simulador de mejoras. El usuario obtiene un resultado con solo marcar su lote.

- **Usuario:** productor chico o mediano de soja, o el técnico del acopio que lo asiste. No carga planillas.
- **Núcleo:** cada evento (siembra, cosecha, remoción de suelo, cobertura, anegamiento, quema, cambio de uso) queda registrado con fecha, sensor, evidencia y nivel de confianza.
- **Diferencial:** las plataformas existentes calculan con lo que el productor declara. LoTestigo registra lo que se observó desde el espacio, con o sin nubes.

### Funciones

1. **Historial del lote:** uso del suelo y cultivos por campaña desde 2020.
2. **Bitácora de eventos:** línea de tiempo con evidencia por evento.
3. **Huella de carbono estimada:** kg CO2e por tonelada, con cada dato etiquetado como verificado, declarado o estimado.
4. **Simulador:** efecto de cambiar una práctica (por ejemplo, sumar cultivo de cobertura) sobre la huella y el puntaje.
5. **Pasaporte del lote:** vista compartible por enlace público, imprimible.

### Qué NO es

- No es una certificación ni reemplaza a VISEC, RTRS o 2BSvs.
- No es una calculadora de huella auditada. Es una estimación con respaldo satelital.
- La interfaz nunca debe usar las palabras "certificado" o "certificación" para describir lo que entrega.

## 3. Referencia e inspiración: ucrop.it

Se toma ucrop.it como referencia de producto. Qué se toma:

- El concepto de "historia de cultivo" por lote y campaña.
- Cada actividad respaldada por una evidencia objetiva.
- El dato pertenece al productor, que decide con quién lo comparte.

Qué se hace distinto:

- En ucrop.it el productor carga la información. En LoTestigo los eventos se detectan por satélite y el productor solo confirma o corrige.
- Carga mínima: un polígono alcanza para obtener un resultado.
- Cada dato muestra su origen y su nivel de confianza.

Restricciones: no copiar marca, textos, capturas, diseño de interfaz ni código de ucrop.it. No usar blockchain (fuera de alcance).

## 4. Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13, Django 6.1, Django REST Framework |
| Base de datos | PostgreSQL 17 |
| Frontend | Angular 22, TypeScript, componentes standalone, signals |
| Mapa | Leaflet (uso directo, sin wrappers de terceros) |
| Entorno | Docker Compose para la base de datos |
| Despliegue | Cloudflare Workers publica el build de Angular y reenvía `/api` y `/media` al backend, que corre en Railway con PostgreSQL (README, sección Despliegue) |

Reglas sobre versiones:

- Antes de usar una API de Angular 22 o Django 6.1, verificarla en la documentación oficial de esa versión. No asumir que coincide con versiones anteriores.
- Si una dependencia no declara compatibilidad con Angular 22, no instalarla. Resolver con Angular puro o con la librería JS sin wrapper.
- No agregar dependencias sin necesidad concreta. Cada dependencia nueva se justifica en el mensaje del commit.

Decisión sobre geodatos: los polígonos se guardan como GeoJSON en un `JSONField`. No se usa PostGIS ni GeoDjango en el MVP, para evitar la instalación de GDAL. El área se calcula en Python con `shapely` y `pyproj`. Si más adelante hacen falta consultas espaciales, se migra a PostGIS.

## 5. Arquitectura

```
[Procesamiento satelital offline]  -->  archivos JSON de eventos + imágenes PNG
                                              |
                                   comando import_events
                                              v
[Angular 22]  <-- REST/JSON -->  [Django + DRF]  <-->  [PostgreSQL]
```

El frontend consulta en vivo, desde el navegador, servicios abiertos de la NASA sin login (NASA POWER, ORNL DAAC para MODIS, CMR de Earthdata y GIBS) para mostrar datos de cualquier polígono, también de un lote recién marcado. El acceso está en `frontend/src/app/core/nasa/`: cada dato lleva su fuente y su origen, nada se interpola, y lo recibido se guarda en el dispositivo para usarlo sin conexión. Esos datos no se guardan en la base ni generan eventos.

Regla central: **el backend no procesa imágenes satelitales en el ciclo de una petición.** El análisis de radar y óptico lo hace el integrante de GIS en notebooks o scripts (carpeta `pipeline/`), y su salida se importa a la base con un comando de gestión. Claude Code no debe implementar descarga ni procesamiento SAR dentro de las vistas.

## 6. Estructura del repositorio

```
lotestigo/
  CLAUDE.md
  README.md
  docker-compose.yml
  .env.example
  wrangler.jsonc       # Worker de Cloudflare que publica la demo
  package.json         # scripts de build y deploy del Worker y del backend (Railway)
  worker/              # sirve frontend/dist/frontend/browser y reenvía /api y /media al backend
  docs/
    EQUIPO.md          # dueño de cada carpeta (3 devs, por funcionalidad)
  backend/
    manage.py
    config/            # settings, urls
    core/              # enum Origin, health, reglas de acceso (compartido)
    accounts/          # alta, ingreso y salida con token de DRF
    lots/              # Lot, Campaign
    events/            # Event, importador
    carbon/            # InputRecord, factores, cálculo, simulador, puntaje
    passports/         # enlace público
    hydrology/         # Cuenca y Caudal: cuenca, SCS-CN, hidrograma unitario (lee data/hydrology)
    requirements.txt
    Dockerfile         # imagen del backend para Railway (se construye desde la raíz)
  frontend/
    src/app/
      core/            # servicios HTTP, modelos, interceptores, sesión
      features/
        landing/       # página de inicio pública
        auth/          # ingresar y crear cuenta
        map/           # mi campo y alta de lote
        examples/      # lotes de ejemplo públicos
        lot/           # ficha, bitácora, comparación radar vs óptico
        footprint/     # huella y simulador
        fertilization/ # ambientes por NDVI y dosis variable
        profit/        # margen bruto
        water/         # Cuenca y Caudal: cuenca aportante, historial, simulador e impacto
        passport/      # vista pública
      shared/          # componentes reutilizables, etiquetas de confianza
  pipeline/            # notebooks y scripts de teledetección (offline)
  data/
    demo/              # lotes y eventos de demostración
    evidence/          # imágenes de respaldo
    hydrology/         # grillas del DEM, lluvia IMERG y capas de la cuenca del Lote 3 (ver su README)
```

## 7. Modelo de datos

**Lot**
- `id`, `name`, `renspa` (opcional), `locality`, `province`
- `geometry` (GeoJSON Polygon, EPSG:4326)
- `area_ha` (calculada)
- `created_at`
- `owner` (FK al usuario, opcional): el productor que lo marcó. Solo él lo ve y lo edita
- `public_example` (bool): lote del pipeline que cualquiera ve y nadie edita. No tiene dueño
- `land_use_unchanged` (bool, opcional): lo que declara el productor sobre el uso del suelo desde 2020. `true` si no cambió, `false` si cambió y `null` si no lo declaró. Es un dato DECLARED
- `land_use_declared_at` (fecha y hora, opcional): cuándo lo declaró. Declarar otra vez pisa la declaración anterior

**Campaign**
- `lot` (FK), `label` (por ejemplo "2025/26"), `crop` (SOY, CORN, WHEAT, OTHER)
- `crop_origin` (ver enum Origin)
- `yield_t_ha` (opcional), `yield_origin`

**Event**
- `lot` (FK), `campaign` (FK, opcional)
- `type`: SOWING, HARVEST, TILLAGE, COVER_CROP, FLOODING, BURN, LAND_USE_CHANGE
- `date` (fecha de detección), `date_uncertainty_days`
- `sensor`: NISAR, SENTINEL1, HLS, LANDSAT, MODIS, VIIRS, SMAP, MANUAL
- `origin` (enum Origin)
- `confidence` (0.0 a 1.0, opcional)
- `evidence_image` (ruta), `evidence_optical_image` (ruta, opcional, para el contraste)
- `metrics` (JSON libre: backscatter, coherencia, NDVI, etc.)
- `is_simulated` (bool)
- `notes`

**InputRecord** (insumos y labores)
- `campaign` (FK), `category`: FERTILIZER_N, FERTILIZER_P, FERTILIZER_OTHER, PESTICIDE, DIESEL, SEED
- `quantity`, `unit`, `origin`, `is_simulated`

**Passport**
- `lot` (FK), `token` (UUID, único), `created_at`, `expires_at` (opcional)

**Enum Origin** (se usa en todo el sistema):
- `VERIFIED`: observado por satélite.
- `DECLARED`: informado por el productor o el acopio.
- `ESTIMATED`: valor regional o por defecto.

## 8. Contrato de importación de eventos

El pipeline offline entrega un JSON por lote. El comando `import_events` lo valida y lo carga. Este formato es el contrato con el integrante de GIS: no cambiarlo sin avisar.

```json
{
  "lot": {
    "name": "Lote demo 1",
    "renspa": null,
    "locality": "Casilda",
    "province": "Santa Fe",
    "geometry": { "type": "Polygon", "coordinates": [] }
  },
  "campaigns": [
    { "label": "2025/26", "crop": "SOY", "crop_origin": "VERIFIED" }
  ],
  "events": [
    {
      "type": "TILLAGE",
      "date": "2026-10-12",
      "date_uncertainty_days": 12,
      "sensor": "NISAR",
      "origin": "VERIFIED",
      "confidence": 0.7,
      "campaign": "2025/26",
      "evidence_image": "evidence/lote1_2026-10-12_nisar.png",
      "evidence_optical_image": "evidence/lote1_2026-10-12_hls.png",
      "metrics": { "hh_db_change": 2.1 },
      "is_simulated": false,
      "notes": ""
    }
  ]
}
```

## 9. Módulo de carbono

Fórmula general: huella por tonelada = suma de (dato de actividad x factor de emisión) / rendimiento.

Componentes: producción de fertilizantes, emisiones de N2O del suelo, gasoil de labores, fitosanitarios, semilla, cambio de uso del suelo.

Reglas obligatorias:

- **No inventar factores de emisión.** Los factores viven en `backend/carbon/factors.yaml`. Cada entrada tiene `value`, `unit`, `source` (documento y tabla) y `validated` (bool). Si no hay fuente verificada, dejar `value: null` y `validated: false`.
- Si falta un factor, el cálculo no falla: devuelve el componente como "sin dato" y lo informa en la respuesta.
- La respuesta de huella incluye siempre el desglose por componente y el `origin` de cada dato usado.
- La respuesta incluye un nivel de confianza global: ALTO si la mayoría de los datos son VERIFIED o DECLARED, BAJO si predominan ESTIMATED.
- El módulo debe tener pruebas unitarias con `pytest`. Es la única parte con pruebas obligatorias.

**Puntaje de sustentabilidad (0 a 100):** regla simple y transparente, con pesos en `backend/carbon/score_config.yaml`. Se marca como provisional en la interfaz. Insumos del puntaje: sin cambio de uso desde 2020, siembra directa, cobertura invernal, rotación, ausencia de quema.

**Simulador:** recibe cambios hipotéticos (por ejemplo `{"cover_crop": true}`) y devuelve huella y puntaje antes y después. No persiste nada.

## 10. API REST

Prefijo `/api/`. JSON. Autenticación por token de DRF (`Authorization: Token <key>`): sin token, las rutas que lo piden dan 401; un lote ajeno da 404, igual que uno inexistente; escribir en un lote de ejemplo da 403. Las reglas de acceso viven en `backend/core/access.py`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/auth/register/` | Pública | Alta de cuenta con `name` (opcional), `email` y `password`. Devuelve `token` y `user` |
| POST | `/auth/login/` | Pública | Ingreso con `email` y `password`. Devuelve `token` y `user`. Límite de intentos por IP |
| POST | `/auth/logout/` | Token | Salida: borra el token |
| GET | `/auth/me/` | Token | Datos de la cuenta: `id`, `email`, `name` |
| GET | `/lots/` | Token | Lotes del usuario con geometría. Cada lote suma `is_example` y `owned`, nunca quién es el dueño |
| POST | `/lots/` | Token | Alta de lote a partir de un polígono, con el usuario como dueño |
| GET | `/examples/` | Pública | Lotes de ejemplo del pipeline, con el mismo formato que la lista |
| GET | `/lots/{id}/` | Dueño o ejemplo | Ficha del lote con campañas |
| GET | `/lots/{id}/events/` | Dueño o ejemplo | Bitácora. Filtros: `type`, `campaign`, `sensor` |
| PATCH | `/events/{id}/` | Dueño | El usuario confirma o corrige un evento |
| GET | `/lots/{id}/footprint/?campaign=` | Dueño o ejemplo | Huella con desglose y orígenes |
| POST | `/lots/{id}/simulate/` | Dueño o ejemplo | Simulador (no guarda nada) |
| GET | `/lots/{id}/score/` | Dueño o ejemplo | Puntaje de sustentabilidad |
| POST | `/lots/{id}/declaration/` | Dueño | El productor declara rendimiento e insumos |
| POST | `/lots/{id}/land-use/` | Dueño | El productor declara con `unchanged` si el lote cambió de uso del suelo desde 2020 (`true` si no cambió). Queda como dato DECLARED con la fecha, pisa la declaración anterior y la ficha la muestra en `land_use_declaration` |
| POST | `/lots/{id}/passport/` | Dueño | Genera enlace público |
| GET | `/passports/{token}/` | Pública | Vista pública de solo lectura |
| GET | `/lots/{id}/hydrology/?lat=&lng=` | Dueño o ejemplo | Cuenca aportante al lote y al punto de salida, subcuencas, ingresos, salidas y sectores a inspeccionar. Solo para lotes dentro de la zona procesada (Lote 3, Casilda); fuera de ella, 404 con `available: false` |
| GET | `/lots/{id}/hydrology/history/?lat=&lng=` | Dueño o ejemplo | Eventos de lluvia IMERG desde 2020 con escorrentía, volumen y caudal simulados |
| POST | `/lots/{id}/hydrology/simulate/` | Dueño o ejemplo | Simulador de lluvia (`rain_mm`, `duration_h`, `arc`, `hsg`, `residue`). No guarda nada |

Un lote creado por POST sin eventos importados devuelve bitácora vacía con un mensaje claro. No generar eventos falsos automáticamente.

## 11. Frontend

Idioma de la interfaz: español de Argentina. Diseño sobrio, legible en notebook y proyector.

Hay una página de inicio pública que invita a crear una cuenta gratis o a ingresar. Mi campo y el alta de lotes piden haber ingresado, y cada productor ve solo sus lotes. Los lotes de ejemplo del pipeline se ven sin cuenta en `/ejemplos`. Sin lotes, Mi campo ofrece usar la ubicación del dispositivo para encontrar el campo; si no se comparte, se busca en el mapa satelital.

Pantallas, en orden de prioridad:

1. **Mapa:** los lotes del productor sobre un mapa base. Clic en un lote abre su ficha.
2. **Ficha del lote:** datos básicos y bitácora como línea de tiempo. Cada evento muestra tipo, fecha, sensor, etiqueta de origen y miniatura de evidencia.
3. **Comparación radar contra óptico:** para un evento, las dos imágenes lado a lado o con deslizador. Es la pantalla central de la demo.
4. **Huella:** valor por tonelada, desglose por componente y etiqueta de origen por dato.
5. **Simulador:** un control (cultivo de cobertura) y el resultado antes y después.
6. **Pasaporte:** vista pública imprimible.
7. **Cuenca y Caudal:** cuenca aportante, historial de lluvias, simulador y zonas a inspeccionar, para el Lote 3. Todo resultado es estimación sin validar (no hay caudales medidos). Ver `data/hydrology/README.md`.

Componente compartido obligatorio: `origin-badge`, que muestra VERIFICADO, DECLARADO o ESTIMADO con color y texto. Se usa en todo dato mostrado. El significado no puede depender solo del color.

Todo dato con `is_simulated: true` se muestra con la leyenda "Dato simulado para la demostración".

## 12. Fuentes de datos

| Fuente | Uso | Nota |
|---|---|---|
| NISAR (NASA/ISRO), banda L | Labranza, anegamiento, cambios de superficie actuales | Datos desde fines de 2025. Acceso por ASF DAAC / Earthdata |
| HLS y Landsat (NASA/USGS) | Uso del suelo desde 2020, cultivos, cobertura (NDVI) | Línea de base histórica |
| MODIS y VIIRS (NASA) | Focos de calor, quema de rastrojos | FIRMS |
| SMAP y NASA POWER | Humedad de suelo y clima | Contexto |
| Sentinel-1 (ESA), banda C | Respaldo si no hay escenas NISAR de la zona | No es dato NASA: etiquetarlo como tal |

El campo `sensor` siempre refleja el sensor real. No rotular como NISAR un dato de otro sensor.

## 13. Reglas de honestidad de datos

Son obligatorias y tienen prioridad sobre la estética de la demo.

1. Todo dato simulado lleva `is_simulated: true` en la base y se muestra como tal.
2. No fabricar eventos, imágenes de evidencia, factores de emisión ni métricas.
3. No afirmar precisión de detección que no fue validada. Usar "prueba de concepto".
4. No usar el logo ni la insignia de la NASA. El texto permitido es "usa datos abiertos de la NASA".
5. No presentar el resultado como certificación.

## 14. Convenciones

- Código, nombres de variables, modelos y rutas en inglés. Textos de interfaz y documentación en español.
- Python: PEP 8, type hints, `ruff` para lint y formato.
- TypeScript: modo estricto, ESLint y Prettier.
- Commits chicos y descriptivos, en español, en imperativo.
- **No agregar a Claude como autor ni coautor, ni líneas de atribución, en commits o pull requests.**
- Secretos y credenciales (Earthdata, base de datos) solo en `.env`. Nunca en el repositorio. Mantener `.env.example` actualizado.
- No subir archivos satelitales crudos (HDF5, GeoTIFF grandes). Solo PNG de evidencia livianos.

## 15. Comandos

```bash
# Base de datos
docker compose up -d db

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py import_events ../data/demo/*.json
python manage.py runserver

# Pruebas
pytest

# Frontend
cd frontend
npm install
npx ng serve

# Despliegue en Cloudflare Workers (desde la raíz, con Node 24)
npm run deploy

# Despliegue del backend en Railway (con acceso al proyecto lotestigo)
npm run deploy:backend
```

## 16. Orden de trabajo

Trabajar en este orden. No avanzar a un paso sin que el anterior funcione de punta a punta.

1. Esqueleto: Docker Compose con PostgreSQL, proyecto Django, proyecto Angular, CORS, README.
2. Modelos, migraciones y comando `import_events` con un lote de ejemplo.
3. API de lotes y eventos.
4. Pantallas de mapa y ficha con bitácora.
5. Pantalla de comparación radar contra óptico.
6. Módulo de carbono con pruebas, y pantalla de huella.
7. Simulador.
8. Pasaporte público.
9. Pulido visual y README final para la entrega.

Si el tiempo no alcanza, se recortan los pasos 8 y 7, en ese orden. Los pasos 1 a 5 son la demo mínima.

## 17. Fuera de alcance

- Roles, recuperación de contraseña e ingreso con cuentas de terceros. La autenticación con mail y contraseña y los lotes privados por productor entraron al alcance por pedido del equipo (ver sección 10).
- Integración real con VISEC, SENASA o sistemas de AFA.
- Procesamiento SAR en línea.
- Módulos de fitosanitarios, nutrientes, agua y logística (son hoja de ruta, no MVP).
- Aplicación móvil nativa, blockchain, pagos.

## 18. Cuándo preguntar

Consultar al equipo antes de: cambiar el contrato de importación, agregar una dependencia pesada, cambiar el stack, o incorporar cualquier dato numérico (factor de emisión, umbral de detección, peso del puntaje) que no tenga fuente.
