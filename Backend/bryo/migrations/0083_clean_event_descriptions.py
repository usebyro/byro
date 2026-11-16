from django.db import migrations


def clean_descriptions(apps, schema_editor):
    """Remove scripts and event handlers from descriptions saved before descriptions were cleaned."""
    from bryo.html_clean import clean_html
    Event = apps.get_model('bryo', 'Event')
    for event in Event.objects.exclude(description='').only('pk', 'description').iterator():
        cleaned = clean_html(event.description)
        if cleaned != event.description:
            Event.objects.filter(pk=event.pk).update(description=cleaned)


class Migration(migrations.Migration):
    dependencies = [('bryo', '0082_merch_code_attempts')]
    operations = [migrations.RunPython(clean_descriptions, migrations.RunPython.noop)]
