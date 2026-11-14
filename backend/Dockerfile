# imagen del backend para railway: django con gunicorn y los datos de data/ (lotes demo y evidencia)
# se construye desde la raíz del repo, porque necesita backend/ y data/ (en railway lo indica la variable RAILWAY_DOCKERFILE_PATH)
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
# gunicorn solo hace falta para servir django en el deploy, por eso no está en requirements.txt
RUN pip install -r backend/requirements.txt gunicorn==26.2.0

COPY backend/ backend/
COPY data/ data/

WORKDIR /app/backend
# en cada arranque: migraciones, lotes nuevos de data/demo (los que ya existen se saltean) y gunicorn en el puerto que da railway
# si un json de data/demo no cumple el contrato, el backend arranca igual con los lotes que ya tenía
CMD ["sh", "-c", "python manage.py migrate --noinput && (python manage.py import_events ../data/demo/*.json || echo 'import_events falló: revisar data/demo') && exec gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 2 --access-logfile -"]
