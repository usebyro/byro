import type {Metadata} from 'next'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import {SITE_URL} from '@/lib/site'
import {serializeJsonLd} from '@/lib/jsonLd'
import {formatShortDate, getBlogPosts} from './blog-data'
import BlogGrid from './BlogGrid'
import {BlogCover, HostBand, ReadTime, TopicPill, topicOf} from './blog-ui'

const DESCRIPTION = 'Guides for running events on Byro, and news on what we’re building.'
const BLOG_URL = `${SITE_URL}/blog`
const SHARE_IMAGE = {url: `${BLOG_URL}/og`, width: 1200, height: 630, alt: 'The Byro blog'}

export const metadata: Metadata = {
  title: 'Blog',
  description: DESCRIPTION,
  alternates: {canonical: BLOG_URL},
  openGraph: {
    type: 'website',
    siteName: 'Byro',
    locale: 'en_NG',
    url: BLOG_URL,
    title: 'Blog | Byro',
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | Byro',
    description: DESCRIPTION,
    images: [SHARE_IMAGE.url],
  },
}

export default async function BlogPage() {
  const posts = await getBlogPosts()
  const featured = posts.find((post) => post.featured) || posts[0]
  const rest = featured ? posts.filter((post) => post._id !== featured._id) : []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Byro blog',
    description: DESCRIPTION,
    url: BLOG_URL,
    publisher: {'@type': 'Organization', name: 'Byro', url: SITE_URL},
    blogPost: posts.slice(0, 20).map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${BLOG_URL}/${post.slug}`,
      datePublished: post.publishedAt,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: serializeJsonLd(jsonLd)}} />
      <Navbar />
      <main className="bg-white font-body text-ink">
        <section aria-labelledby="blog-title" className="mx-auto flex max-w-[1120px] flex-col gap-3.5 px-4 pb-7 pt-10 motion-safe:animate-rise md:px-6 md:pb-12 md:pt-[88px]">
          <h1 id="blog-title" className="font-display text-[44px] font-bold leading-none tracking-[-0.045em] md:text-[72px]">
            Blog
          </h1>
          <p className="max-w-[44ch] text-[17px] leading-normal text-body md:text-[19px]">
            Guides for running events on Byro, and news on what we’re building.
          </p>
        </section>

        {featured ? (
          <section aria-label="Featured post" className="mx-auto max-w-[1120px] px-4 pb-12 motion-safe:animate-rise md:px-6 md:pb-[88px]" style={{animationDelay: '60ms'}}>
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid grid-cols-1 items-center gap-5 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 md:grid-cols-2 md:gap-10"
            >
              <div className="overflow-hidden rounded-3xl">
                <BlogCover
                  post={featured}
                  className="aspect-[4/3] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-[1.02]"
                  markClassName="text-[64px] md:text-[104px]"
                />
              </div>
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted">
                  <TopicPill tag={topicOf(featured)} />
                  <span>{formatShortDate(featured.publishedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <ReadTime value={featured.readTime} />
                </div>
                <h2 className="text-balance font-display text-[30px] font-bold leading-[1.05] tracking-[-0.035em] transition-colors group-hover:text-brand-dark md:text-[44px]">
                  {featured.title}
                </h2>
                {featured.excerpt && <p className="max-w-[46ch] text-[17px] leading-[1.55] text-body">{featured.excerpt}</p>}
                {/* Styled as a button; the whole card is the link, so it can't be a real <button> inside it. */}
                <span className="mt-1 inline-flex min-h-12 items-center self-start rounded-full bg-brand px-[22px] text-base font-bold text-white transition-[transform,background-color] duration-150 group-hover:bg-[#2F5EE0] group-active:scale-[0.97]">
                  Continue reading
                </span>
              </div>
            </Link>
          </section>
        ) : (
          <section className="mx-auto max-w-[1120px] px-4 pb-16 md:px-6">
            <div className="flex flex-col items-start gap-2 rounded-3xl bg-[#F4F6FA] p-8 md:p-12">
              <h2 className="font-display text-2xl font-bold">No posts yet</h2>
              <p className="text-body">Check back soon for guides and news.</p>
            </div>
          </section>
        )}

        {rest.length > 0 && <BlogGrid posts={rest} />}

        <HostBand />
      </main>
      <Footer />
    </>
  )
}
