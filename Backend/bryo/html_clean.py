"""
Cleaning for HTML that organisers write (an event's description), which pages show as real formatting.

Anything not on the lists below is removed: scripts, styles, frames, forms, event handlers such as onerror,
and links that are not web, email or phone links. What stays is what the event editor can produce.
"""
import nh3

ALLOWED_TAGS = {
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h2', 'h3', 'a',
}
ALLOWED_ATTRIBUTES = {'a': {'href'}}
ALLOWED_URL_SCHEMES = {'http', 'https', 'mailto', 'tel'}


def clean_html(value):
    """Return `value` with only the allowed formatting left. Safe to run again on its own output."""
    if not value:
        return ''
    return nh3.clean(
        str(value),
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        link_rel='noopener noreferrer nofollow',
        set_tag_attribute_values={'a': {'target': '_blank'}},
        strip_comments=True,
    )
