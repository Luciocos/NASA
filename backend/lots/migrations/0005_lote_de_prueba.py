"""Para la presentación queda un solo lote de ejemplo: el Lote 3 pasa a llamarse "Lote de prueba"
y los lotes 1, 2 y 4 dejan de ser públicos (no se borran: sus JSON pasaron a data/demo-extra/).
"""

from django.db import migrations

HIDDEN = ['Lote 1', 'Lote 2', 'Lote 4']


def forward(apps, schema_editor):
    Lot = apps.get_model('lots', 'Lot')
    examples = Lot.objects.filter(owner__isnull=True, public_example=True)
    examples.filter(name='Lote 3').update(name='Lote de prueba')
    examples.filter(name__in=HIDDEN).update(public_example=False)


def backward(apps, schema_editor):
    Lot = apps.get_model('lots', 'Lot')
    pipeline = Lot.objects.filter(owner__isnull=True)
    pipeline.filter(name='Lote de prueba', public_example=True).update(name='Lote 3')
    pipeline.filter(name__in=HIDDEN, public_example=False).update(public_example=True)


class Migration(migrations.Migration):
    dependencies = [
        ('lots', '0004_lot_land_use_declaration'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
