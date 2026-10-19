import { ImageResponse } from "next/og";
import { fetchShareEvent } from "@/lib/eventShare";
import { stampLook } from "@/lib/stamps";
import { StampArt } from "@/lib/stampArt";

// An event's stamp as a picture, for emails (which drop CSS borders and rotation).
// ?id=<stamp id> picks the same shape and tilt the passport shows; nothing about the person is in it.
export async function GET(request, { params }) {
  const { slug } = await params;
  const event = await fetchShareEvent(slug);
  if (!event) return new Response("Not found", { status: 404 });

  const id = Number(new URL(request.url).searchParams.get("id")) || 0;
  const look = stampLook({ id, event_name: event.name || "Event", day: event.day, category: event.category, location: event.location });
  const SIZE = 400;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF" }}>
        <StampArt look={look} size={Math.round(SIZE * 0.86)} />
      </div>
    ),
    { width: SIZE, height: SIZE, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
