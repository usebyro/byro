"""Plain-English summaries of what changed when someone edits something, for the activity log."""
from decimal import Decimal

# (field, label, kind): kind 'text' shows old to new, 'note' only says it changed (long text, files).
EVENT_FIELDS = [
    ('name', 'name', 'text'),
    ('day', 'date', 'text'),
    ('time_from', 'start time', 'text'),
    ('time_to', 'end time', 'text'),
    ('location', 'location', 'text'),
    ('virtual_link', 'online link', 'text'),
    ('category', 'category', 'text'),
    ('ticket_price', 'ticket price', 'text'),
    ('capacity', 'capacity', 'text'),
    ('max_tickets_per_person', 'tickets per person', 'text'),
    ('visibility', 'visibility', 'text'),
    ('timezone', 'timezone', 'text'),
    ('hosted_by', 'hosted by', 'text'),
    ('transferable', 'transfers allowed', 'text'),
    ('pass_fee_to_attendee', 'fee paid by attendee', 'text'),
    ('show_remaining_count', 'show tickets left', 'text'),
    ('description', 'description', 'note'),
    ('event_image', 'image', 'note'),
]
TIER_FIELDS = [
    ('name', 'name', 'text'),
    ('price', 'price', 'text'),
    ('capacity', 'capacity', 'text'),
    ('min_tickets_per_person', 'minimum per order', 'text'),
    ('max_tickets_per_person', 'maximum per order', 'text'),
    ('description', 'description', 'note'),
]


def snapshot(obj, fields):
    """The tracked values of `obj` now, to compare after an edit."""
    out = {}
    for field, _label, _kind in fields:
        value = getattr(obj, field, None)
        out[field] = getattr(value, 'name', value) if field == 'event_image' else value
    out['is_draft'] = getattr(obj, 'is_draft', None)
    return out


def _show(value):
    if value is None or value == '':
        return 'empty'
    if isinstance(value, bool):
        return 'yes' if value else 'no'
    if isinstance(value, (Decimal, float)):
        value = f'{value:f}'.rstrip('0').rstrip('.') if '.' in f'{value:f}' else f'{value:f}'
    text = str(value)
    return text if len(text) <= 40 else text[:39] + '…'


def describe(before, after, fields):
    """'name: A → B; ticket price: 5000 → 6000; image changed', or '' when nothing changed."""
    parts = []
    for field, label, kind in fields:
        old, new = before.get(field), after.get(field)
        if old == new:
            continue
        parts.append(f'{label} changed' if kind == 'note' else f'{label}: {_show(old)} → {_show(new)}')
    if before.get('is_draft') is True and after.get('is_draft') is False:
        parts.append('published')
    return '; '.join(parts)
