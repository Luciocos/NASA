"""Comando import_events: carga los JSON del pipeline. Ver CLAUDE.md, sección 8.

Uso: python manage.py import_events ../data/demo/*.json [--replace]
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from events.importer import ImportValidationError, LotAlreadyExistsError, import_lot


class Command(BaseCommand):
    help = 'Importa lotes, campañas y eventos desde archivos JSON del pipeline.'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('files', nargs='+', type=Path, help='Archivos JSON, uno por lote.')
        parser.add_argument(
            '--replace',
            action='store_true',
            help='Reemplaza el lote si ya existe (borra también las correcciones del usuario).',
        )

    def handle(self, *args, **options) -> None:
        failed = False
        for path in options['files']:
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
            except (OSError, json.JSONDecodeError) as exc:
                self.stderr.write(self.style.ERROR(f'{path}: no se pudo leer ({exc})'))
                failed = True
                continue

            try:
                lot = import_lot(data, replace=options['replace'])
            except ImportValidationError as exc:
                self.stderr.write(self.style.ERROR(f'{path}: no cumple el contrato'))
                for error in exc.errors:
                    self.stderr.write(f'  - {error}')
                failed = True
                continue
            except LotAlreadyExistsError as exc:
                self.stdout.write(
                    self.style.WARNING(f'{path}: el lote "{exc}" ya existe, se omite (--replace)')
                )
                continue

            events = lot.events.all()
            self.stdout.write(
                self.style.SUCCESS(
                    f'{path}: "{lot.name}" ({lot.area_ha:.1f} ha), '
                    f'{lot.campaigns.count()} campañas, {events.count()} eventos'
                )
            )
            for event in events:
                for image in (event.evidence_image, event.evidence_optical_image):
                    if image and not (Path(settings.MEDIA_ROOT) / image).is_file():
                        self.stdout.write(self.style.WARNING(f'  falta la imagen data/{image}'))

        if failed:
            raise CommandError('Uno o más archivos no se importaron.')
