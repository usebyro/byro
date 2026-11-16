import secrets

from django.db import migrations, models

ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def give_codes(apps, schema_editor):
    Order = apps.get_model('bryo', 'MerchOrder')
    taken = set()
    for order in Order.objects.filter(ref_code__isnull=True):
        while True:
            code = 'BY-' + ''.join(secrets.choice(ALPHABET) for _ in range(6))
            if code not in taken:
                taken.add(code)
                break
        Order.objects.filter(pk=order.pk).update(ref_code=code)


class Migration(migrations.Migration):
    dependencies = [('bryo', '0079_merch_pickup_moved')]
    operations = [
        migrations.AddField('merchorder', 'ref_code', models.CharField(max_length=12, null=True, blank=True, editable=False, unique=True)),
        migrations.RunPython(give_codes, migrations.RunPython.noop),
    ]
