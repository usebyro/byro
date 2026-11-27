// byro-og: renders Byro's generated pictures. The main Worker forwards these paths here (see
// frontend/src/lib/og/proxy.js), so the URLs people share and the ones in emails don't change.
//
//   GET /discover/:slug/og      event link-preview card
//   GET /discover/:slug/stamp   the event's stamp as a picture (?id=<stamp id>)
//   GET /s/:token/og            shared-stamp link preview
//   GET /blog-card              blog link preview (?label=&headline=&footer=)
import { ImageResponse as BaseImageResponse } from "workers-og";
import geist from "./fonts/Geist-Regular.ttf";
// Geist has no naira sign (₦); this covers it and other Latin-extended glyphs.
import notoSansExt from "@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff";
import { fetchShareEvent, fetchSharedStamp } from "../../frontend/src/lib/eventShare";
import { eventCard, stampShareCard, stampPicture, blogCard } from "../../frontend/src/lib/og/cards";

// Same font Next's own image renderer uses, so the cards look the same as they always did.
// (Only the regular weight is bundled; bold is drawn from it, as before.)
class ImageResponse extends BaseImageResponse {
  constructor(element, options = {}) {
    super(element, { ...options, fonts: [
        { name: "Geist", data: geist, weight: 400, style: "normal" },
        { name: "Noto Sans", data: notoSansExt, weight: 400, style: "normal" },
      ] });
  }
}

const notFound = () => new Response("Not found", { status: 404 });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    let match;

    if ((match = path.match(/^\/discover\/([^/]+)\/og$/))) {
      const event = await fetchShareEvent(decodeURIComponent(match[1]));
      return event ? eventCard(ImageResponse, event) : notFound();
    }
    if ((match = path.match(/^\/discover\/([^/]+)\/stamp$/))) {
      const event = await fetchShareEvent(decodeURIComponent(match[1]));
      const id = Number(url.searchParams.get("id")) || 0;
      return event ? stampPicture(ImageResponse, event, id) : notFound();
    }
    if ((match = path.match(/^\/s\/([^/]+)\/og$/))) {
      const stamp = await fetchSharedStamp(decodeURIComponent(match[1]));
      return stamp ? stampShareCard(ImageResponse, stamp) : notFound();
    }
    if (path === "/blog-card") {
      return blogCard(ImageResponse, {
        label: url.searchParams.get("label") || "Blog",
        headline: url.searchParams.get("headline") || "Byro",
        footer: url.searchParams.get("footer") || "usebyro.com/blog",
      });
    }
    return notFound();
  },
};
