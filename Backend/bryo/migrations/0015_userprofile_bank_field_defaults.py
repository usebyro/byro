from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bryo', '0014_add_payout_request_and_profile_bank_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='bank_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='account_number',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='account_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
