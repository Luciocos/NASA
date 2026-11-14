# LoTestigo

Bitácora de manejo de un lote agrícola, detectada por satélite.

LoTestigo es una **prueba de concepto** desarrollada en 48 horas para el NASA Space Apps Challenge 2026 (sede Rosario). Usa datos abiertos de la NASA, con radar NISAR (banda L) como sensor principal, para registrar qué pasó en un lote: siembra, cosecha, remoción de suelo, cobertura, anegamiento, quema o cambio de uso. Sobre esa bitácora estima una huella de carbono y permite simular mejoras de manejo.

## Desafíos

- **Desafío oficial:** visualización de datos de radar NISAR y detección de cambios en la superficie.
- **Desafío local:** AgTech para la Zona Núcleo, junto a AFA (Agricultores Federados Argentinos).

## Qué hace

1. **Historial del lote:** uso del suelo y cultivos por campaña desde 2020.
2. **Bitácora de eventos:** línea de tiempo con fecha, sensor, evidencia y nivel de confianza por evento.
3. **Comparación radar contra óptico:** la evidencia de cada evento, lado a lado.
4. **Huella de carbono estimada:** kg CO2e por tonelada, con cada dato etiquetado como verificado, declarado o estimado.
5. **Simulador:** efecto de cambiar una práctica (por ejemplo, sumar cultivo de cobertura) sobre la huella y el puntaje.
6. **Pasaporte del lote:** vista compartible por enlace público, imprimible.

El productor no carga planillas: marca su lote en el mapa y confirma o corrige lo que se detectó.

## Qué no es

- No es una certificación y no reemplaza a VISEC, RTRS ni 2BSvs.
- No es una calculadora de huella auditada: es una estimación con respaldo satelital.
- La precisión de detección no está validada. Todo dato simulado se marca como tal en la base y en la interfaz.

## Cómo funciona

```
[Procesamiento satelital offline]  -->  JSON de eventos + imágenes PNG
                                              |
                                   comando import_events
                                              v
[Angular] <-- REST/JSON --> [Django + DRF] <--> [PostgreSQL]
```

El backend no procesa imágenes satelitales. El análisis de radar y óptico se hace aparte (carpeta `pipeline/`) y su salida se importa con un comando de gestión.

## Stack

- **Backend:** Python 3.13, Django 6.1, Django REST Framework
- **Base de datos:** PostgreSQL 17 (Docker Compose)
- **Frontend:** Angular 22, TypeScript
- **Mapa:** Leaflet

Los polígonos se guardan como GeoJSON en un campo JSON, sin PostGIS.

## Cómo correrlo

Requisitos: Python 3.13, Node 24 LTS (ver `frontend/.nvmrc`) y Docker.

```bash
# Variables de entorno (completar POSTGRES_PASSWORD)
cp .env.example .env

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

# Frontend (en http://localhost:4200, con proxy de /api al backend)
cd frontend
npm install
npx ng serve
```

Para comprobar que todo está conectado: `http://localhost:8000/api/health/` responde `{"status": "ok"}` y el encabezado del frontend dice "Backend conectado".

Las credenciales (Earthdata, base de datos) van solo en un archivo `.env`, que no se sube al repositorio. Hay un `.env.example` de referencia.

## Despliegue

La demo está publicada en **https://lotestigo.1mj0t4h.workers.dev**. No pide login: la ve cualquiera que tenga el enlace, y no aparece en buscadores.

Corre en Cloudflare Workers (`wrangler.jsonc` y `worker/index.js`):

- El Worker publica el build de Angular. Las rutas de la app (`/mapa`, `/lotes/1`, `/pasaporte/<token>`) devuelven `index.html` y las resuelve el router de Angular.
- `/api/` y `/media/` van al backend de Django, igual que el proxy de `ng serve`. Los archivos de `/media/` que genera el build, como los íconos de Leaflet, los sirve el propio Worker.
- La dirección del backend es el secret `API_ORIGIN` (una URL `https://`), que se carga con `npx --yes wrangler@4.155.0 secret put API_ORIGIN`. Mientras no esté cargado, `/api/` responde 503 y el encabezado muestra "Backend sin conexión".

Para publicar a mano, con Node 24 (ver `frontend/.nvmrc`) y una sesión de Wrangler en la cuenta de Cloudflare de la demo:

```bash
npm run deploy
```

Compila el frontend (`npm ci` y `ng build`) y lo sube con Wrangler.

Cada push a `main` corre `.github/workflows/deploy.yml`, que compila el frontend. Si el repositorio tiene los secrets `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, además lo publica; sin ellos solo compila.

## Estructura

Monorepo separado por funcionalidad:

```
backend/     Django: core, lots, events, carbon, passports
frontend/    Angular: features map, lot, footprint, passport
pipeline/    Notebooks y scripts de teledetección (offline)
data/        Lotes de demostración e imágenes de evidencia
docs/        Reparto del trabajo en el equipo
```

Quién es dueño de cada parte está en [docs/EQUIPO.md](docs/EQUIPO.md). Las reglas de trabajo, el modelo de datos, la API y el contrato de importación están en [CLAUDE.md](CLAUDE.md).

## Fuentes de datos

| Fuente | Uso |
|---|---|
| NISAR (NASA/ISRO), banda L | Labranza, anegamiento, cambios de superficie |
| HLS y Landsat (NASA/USGS) | Uso del suelo desde 2020, cobertura |
| MODIS y VIIRS (NASA) | Focos de calor, quema de rastrojos |
| SMAP y NASA POWER | Humedad de suelo y clima |
| Sentinel-1 (ESA), banda C | Respaldo cuando no hay escenas NISAR; no es dato NASA |

Este proyecto usa datos abiertos de la NASA. No está afiliado a la NASA ni cuenta con su aval.

## Licencia

[MIT](LICENSE)
