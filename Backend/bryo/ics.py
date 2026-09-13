import uuid
from datetime import datetime


def _escape(text):
    return (
        str(text)
        .replace('\\', '\\\\')
        .replace(';', '\\;')
        .replace(',', '\\,')
        .replace('\n', '\\n')
    )


def generate_ics(*, event_name, description, location, start, end, organizer_name=None, uid=None):
    """
    Build an RFC 5545 .ics file (bytes) for a single event.

    `start`/`end` are naive datetimes in the event's own local time. Events
    don't store a timezone, so DTSTART/DTEND are emitted as "floating" time
    (no Z, no TZID) and each calendar app renders them in the viewer's own
    timezone — reasonable given most attendees are local to the venue.
    """
    def fmt(dt):
        return dt.strftime('%Y%m%dT%H%M%S')

    now = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    uid = uid or f"byro-{uuid.uuid4()}@usebyro.com"

    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Byro Africa//Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:{uid}',
        f'DTSTART:{fmt(start)}',
        f'DTEND:{fmt(end)}',
        f'SUMMARY:{_escape(event_name)}',
        f'DESCRIPTION:{_escape(description or "")}',
        f'LOCATION:{_escape(location or "")}',
    ]
    if organizer_name:
        lines.append(f'ORGANIZER;CN={_escape(organizer_name)}:mailto:hello@usebyro.com')
    lines += [
        f'DTSTAMP:{now}',
        'SEQUENCE:0',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
    return ('\r\n'.join(lines) + '\r\n').encode('utf-8')
