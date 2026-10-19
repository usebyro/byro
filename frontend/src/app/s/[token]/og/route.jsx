import { ImageResponse } from "next/og";
import { fetchSharedStamp } from "@/lib/eventShare";
import { stampLook, stampWords } from "@/lib/stamps";
import { StampArt } from "@/lib/stampArt";

// The link preview for a shared stamp (board 31c): "I was at Tech Meetup", 1200x630.
export async function GET(_request, { params }) {
  const { token } = await params;
  const s = await fetchSharedStamp(token);
  if (!s) return new Response("Not found", { status: 404 });

  const look = stampLook({ id: s.id, event_name: s.event_name, day: s.day, category: s.category, location: s.location });
  const place = (s.location || "").split(",").pop().trim();
  const name = (s.event_name || "").slice(0, 70);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 72, padding: "72px 88px", background: "#FFFDE9", color: "#14161C" }}>
        <StampArt look={look} size={380} />
        <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 40 }}>
            <div style={{ display: "flex", fontSize: 36, color: "#5B6272" }}>I was at</div>
            <div style={{ display: "flex", fontSize: name.length > 30 ? 60 : 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 32, color: "#3B4252", marginTop: 10 }}>{[stampWords(s.day), place].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Byro</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
