/** @jsxRuntime automatic */
/** @jsxImportSource react */
// The four generated pictures (link previews and email stamps), written once.
// Each takes the image renderer as its first argument, because two places render them:
//  - the Next app itself, with `ImageResponse` from "next/og" (local dev, normal builds), and
//  - the byro-og Worker (og-worker/), with `ImageResponse` from "workers-og" on Cloudflare,
//    which keeps the image renderer out of the main app so it fits Cloudflare's script size limit.
import { StampArt } from "../stampArt";
import { stampLook, stampWords } from "../stamps";
import { whenText, priceText } from "../eventShare";

const PREVIEW_CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

/** The card shown in link previews for an event that has no uploaded image. */
export function eventCard(ImageResponse, event) {
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
    { width: 1200, height: 630, headers: { "Cache-Control": PREVIEW_CACHE } },
  );
}

/** The link preview for a shared stamp: "I was at Tech Meetup", 1200x630. */
export function stampShareCard(ImageResponse, s) {
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

/** An event's stamp as a picture, for emails (which drop CSS borders and rotation). */
export function stampPicture(ImageResponse, event, id) {
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

/** A 1200x630 link-preview card on Byro blue: a small label, a big headline, and the address. */
export function blogCard(ImageResponse, { label, headline, footer }) {
  const text = headline.slice(0, 110);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#3669F6',
          color: '#FFFFFF',
          padding: '72px 80px',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
          <div style={{display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: -1}}>byro</div>
          <div style={{display: 'flex', background: '#FFFFFF', color: '#2451D6', borderRadius: 999, padding: '8px 22px', fontSize: 26, fontWeight: 700}}>
            {label}
          </div>
        </div>
        <div style={{display: 'flex', fontSize: text.length > 60 ? 64 : text.length > 30 ? 80 : 120, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2}}>
          {text}
        </div>
        <div style={{display: 'flex', fontSize: 30, opacity: 0.85}}>{footer}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": PREVIEW_CACHE },
    },
  );
}
