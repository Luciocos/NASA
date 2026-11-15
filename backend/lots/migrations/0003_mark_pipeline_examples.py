"""Marca como ejemplos públicos los lotes del pipeline que ya estaban en la base.

Son los cuatro lotes de Casilda de data/demo. Los lotes nuevos que importe import_events
ya entran marcados (events/importer.py).
"""

from django.db import migrations

PIPELINE_LOT_NAMES = ['Lote 1', 'Lote 2', 'Lote 3', 'Lote 4']


def mark_pipeline_examples(apps, schema_editor):
    Lot = apps.get_model('lots', 'Lot')
    Lot.objects.filter(name__in=PIPELINE_LOT_NAMES, owner__isnull=True).update(
        public_example=True
    )


class Migration(migrations.Migration):

    dependencies = [
        ('lots', '0002_lot_owner_public_example'),
    ]

    operations = [
        migrations.RunPython(mark_pipeline_examples, migrations.RunPython.noop),
    ]
