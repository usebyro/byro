import { SITE_URL as BASE_URL } from '@/lib/site';
import { getBlogPosts } from './blog/blog-data';

// Same rule as the rest of the app: the API lives under /api/.
const API_BASE = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw + '/' : raw + '/api/';
})();

// Static pages that are always indexed
const staticPages = [
  { url: BASE_URL,                      priority: 1.0, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/discover`,        priority: 0.9, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/communities`,     priority: 0.9, changeFrequency: 'daily'   },
  { url: `${BASE_URL}/pricing`,         priority: 0.9, changeFrequency: 'monthly' },
  { url: `${BASE_URL}/faq`,             priority: 0.9, changeFrequency: 'monthly' },
  { url: `${BASE_URL}/blog`,            priority: 0.5, changeFrequency: 'weekly'  },
  { url: `${BASE_URL}/terms`,           priority: 0.4, changeFrequency: 'yearly'  },
  { url: `${BASE_URL}/privacy`,         priority: 0.4, changeFrequency: 'yearly'  },
  { url: `${BASE_URL}/refund-policy`,   priority: 0.4, changeFrequency: 'yearly'  },
  { url: `${BASE_URL}/cookies`,         priority: 0.3, changeFrequency: 'yearly'  },
  { url: `${BASE_URL}/careers`,         priority: 0.4, changeFrequency: 'monthly' },
];

const asList = (data) => (Array.isArray(data) ? data : (data?.results ?? []));

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 3600 } }); // refresh hourly
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json();
}

export default async function sitemap() {
  const now = new Date();

  const entries = staticPages.map(({ url, priority, changeFrequency }) => ({
    url,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Live event pages. They live at /discover/{slug}, NOT /events/{slug}.
  try {
    const events = asList(await getJson('events/'));
    for (const e of events) {
      if (!e.slug || e.is_active === false) continue;
      entries.push({
        url: `${BASE_URL}/discover/${e.slug}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch events:', err);
  }

  // Public community pages (/u/{handle}), a few pages of the directory at 48 each.
  try {
    for (let page = 1; page <= 5; page++) {
      const data = await getJson(`communities/?page=${page}&page_size=48`);
      const communities = asList(data);
      for (const c of communities) {
        if (!c.handle) continue;
        entries.push({
          url: `${BASE_URL}/u/${c.handle}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
      if (communities.length < 48) break;
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch communities:', err);
  }

  // Blog posts (getBlogPosts returns [] if Sanity is unreachable).
  for (const post of await getBlogPosts()) {
    if (!post.slug) continue;
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
