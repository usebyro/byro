from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bryo', '0015_alter_userprofile_account_name_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='max_tickets_per_email',
            field=models.PositiveIntegerField(
                null=True,
                blank=True,
                help_text='Max tickets a single email may hold for this event. Null = unlimited.',
            ),
        ),
        migrations.AddField(
            model_name='tickettier',
            name='admits_count',
            field=models.PositiveIntegerField(default=1),
        ),
    ]
