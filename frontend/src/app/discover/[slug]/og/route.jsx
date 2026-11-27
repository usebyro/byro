import { fetchShareEvent } from "@/lib/eventShare";
import { eventCard } from "@/lib/og/cards";
import { ogResponse, notFound } from "@/lib/og/respond";

// The card shown in link previews for an event that has no uploaded image:
// the event's name, when, where and price on a flat brand colour.
export async function GET(_request, { params }) {
  const { slug } = await params;
  return ogResponse(`/discover/${encodeURIComponent(slug)}/og`, async (ImageResponse) => {
    const event = await fetchShareEvent(slug);
    return event ? eventCard(ImageResponse, event) : notFound();
  });
}
