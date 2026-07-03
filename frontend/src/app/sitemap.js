const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://usebyro.com';

// Static pages that are always indexed
const staticPages = [
  { url: BASE_URL,                      priority: 1.0, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/events`,          priority: 0.9, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/discover`,        priority: 0.8, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/pricing`,         priority: 0.7, changeFrequency: 'monthly' },
  { url: `${BASE_URL}/faq`,             priority: 0.6, changeFrequency: 'monthly' },
  { url: `${BASE_URL}/terms`,           priority: 0.4, changeFrequency: 'yearly'  },
  { url: `${BASE_URL}/refund-policy`,   priority: 0.4, changeFrequency: 'yearly'  },
];

export default async function sitemap() {
  const now = new Date();

  // Build static entries
  const staticEntries = staticPages.map(({ url, priority, changeFrequency }) => ({
    url,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Fetch live event pages
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events`, {
      next: { revalidate: 3600 }, // revalidate every hour
    });

    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    // API may return { results: [...] } or a plain array
    const events = Array.isArray(data) ? data : (data.results ?? []);

    const eventEntries = events
      .filter((e) => e.slug && e.is_active !== false)
      .map((e) => ({
        // Events live at /{slug}, NOT /events/{slug}
        url: `${BASE_URL}/${e.slug}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      }));

    return [...staticEntries, ...eventEntries];
  } catch (err) {
    console.error('[sitemap] Failed to fetch events:', err);
    return staticEntries;
  }
}
