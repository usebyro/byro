// Answers an image request. On the Cloudflare build the picture is drawn by the byro-og Worker (og-worker/),
// reached through the OG service binding, which keeps the image renderer out of this Worker's size budget.
// Everywhere else (local dev, normal builds) it is drawn right here with Next's own renderer.
//
//   workerPath  where byro-og serves it, e.g. "/discover/abc/og"
//   renderHere  (ImageResponse) => Response, used when not on Cloudflare
export async function ogResponse(workerPath, renderHere) {
  if (process.env.BYRO_TARGET === "cloudflare") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    return getCloudflareContext().env.OG.fetch(`https://og.internal${workerPath}`);
  }
  const { ImageResponse } = await import("next/og");
  return renderHere(ImageResponse);
}

export const notFound = () => new Response("Not found", { status: 404 });
