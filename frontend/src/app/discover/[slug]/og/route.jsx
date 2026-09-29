import { ImageResponse } from "next/og";
import { fetchShareEvent, whenText, priceText } from "@/lib/eventShare";

// The card shown in link previews for an event that has no uploaded image:
// the event's name, when, where and price on a flat brand colour.
export async function GET(_request, { params }) {
  const { slug } = await params;
  const event = await fetchShareEvent(slug);
  if (!event) return new Response("Not found", { status: 404 });

  const name = (event.name || "Event").slice(0, 90);
  const when = whenText(event);
  const where = event.location || "";
  const price = priceText(event);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#4F6EF7",
          color: "#ffffff",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>byro</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: name.length > 40 ? 64 : 84, fontWeight: 700, lineHeight: 1.1 }}>
            {name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 36, opacity: 0.92 }}>
            {when ? <div style={{ display: "flex" }}>{when}</div> : null}
            {where ? <div style={{ display: "flex", marginTop: 8 }}>{where}</div> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 32 }}>
          <div
            style={{
              display: "flex",
              background: "#ffffff",
              color: "#1F2A5A",
              borderRadius: 999,
              padding: "12px 28px",
              fontWeight: 700,
            }}
          >
            {price}
          </div>
          <div style={{ display: "flex", opacity: 0.85 }}>usebyro.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" },
    }
  );
}
