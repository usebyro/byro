import { fetchShareEvent } from "@/lib/eventShare";
import { stampPicture } from "@/lib/og/cards";
import { ogResponse, notFound } from "@/lib/og/respond";

// An event's stamp as a picture, for emails (which drop CSS borders and rotation).
// ?id=<stamp id> picks the same shape and tilt the passport shows; nothing about the person is in it.
export async function GET(request, { params }) {
  const { slug } = await params;
  const id = Number(new URL(request.url).searchParams.get("id")) || 0;
  return ogResponse(`/discover/${encodeURIComponent(slug)}/stamp?id=${id}`, async (ImageResponse) => {
    const event = await fetchShareEvent(slug);
    return event ? stampPicture(ImageResponse, event, id) : notFound();
  });
}
