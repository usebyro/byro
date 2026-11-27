import { fetchSharedStamp } from "@/lib/eventShare";
import { stampShareCard } from "@/lib/og/cards";
import { ogResponse, notFound } from "@/lib/og/respond";

// The link preview for a shared stamp (board 31c): "I was at Tech Meetup", 1200x630.
export async function GET(_request, { params }) {
  const { token } = await params;
  return ogResponse(`/s/${encodeURIComponent(token)}/og`, async (ImageResponse) => {
    const stamp = await fetchSharedStamp(token);
    return stamp ? stampShareCard(ImageResponse, stamp) : notFound();
  });
}
