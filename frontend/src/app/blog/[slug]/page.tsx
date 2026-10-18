import type {Metadata} from 'next'
import Link from 'next/link'
import {PortableText} from 'next-sanity'
import {HugeiconsIcon} from '@hugeicons/react'
import {ArrowLeft01Icon, ArrowRight02Icon} from '@hugeicons/core-free-icons'
import {notFound} from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import {formatShortDate, getBlogPost, getBlogPosts} from '../blog-data'
import {BlogCover, HostBand, ReadTime, TopicPill, toneFor, topicOf} from '../blog-ui'
import {ShareBox, ShareRow} from './BlogShare'

type PageProps = {params: Promise<{slug: string}>}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) return {title: 'Post Not Found'}

  return {
    title: post.title,
    description: post.excerpt || `${post.title} — Byro blog`,
    alternates: {canonical: `/blog/${post.slug}`},
  }
}

export default async function PostPage({params}: PageProps) {
  const {slug} = await params
  const [post, posts] = await Promise.all([getBlogPost(slug), getBlogPosts()])

  if (!post) return notFound()

  const more = posts.filter((item) => item.slug !== post.slug).slice(0, 2)

  return (
    <>
      <Navbar />
      <main className="bg-white font-body text-ink">
        <article>
          <header className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-8 motion-safe:animate-rise md:px-6 md:pt-16">
            <Link
              href="/blog"
              className="-ml-1.5 inline-flex min-h-11 items-center gap-1 self-start rounded-full text-[15px] font-bold text-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={20} color="currentColor" aria-hidden />
              All posts
            </Link>
            <TopicPill tag={topicOf(post)} />
            <h1 className="text-balance font-display text-[36px] font-bold leading-[1.03] tracking-[-0.04em] md:text-[56px]">
              {post.title}
            </h1>
            {post.excerpt && <p className="text-lg leading-normal text-body md:text-xl">{post.excerpt}</p>}
            <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-ink font-display text-[15px] font-extrabold text-white">
                  {post.authorInitials}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold">{post.authorName}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                    {formatShortDate(post.publishedAt)}
                    <span aria-hidden="true">·</span>
                    <ReadTime value={post.readTime} size={15} />
                  </span>
                </div>
              </div>
              <ShareRow slug={post.slug} title={post.title} />
            </div>
          </header>

          <div className="mx-auto max-w-[1120px] px-4 pt-8 md:px-6">
            <BlogCover post={post} className="aspect-[21/9] min-h-[220px] rounded-[28px]" markClassName="text-[72px] md:text-[160px]" />
          </div>

          {post.body?.length ? (
            <div className="prose prose-lg mx-auto max-w-[720px] px-4 pt-8 md:px-6 prose-headings:font-display prose-headings:font-bold prose-headings:tracking-[-0.025em] prose-headings:text-ink prose-p:leading-[1.7] prose-p:text-[#2B303B] prose-a:text-brand-dark prose-strong:text-ink prose-li:text-[#2B303B]">
              <PortableText value={post.body} />
            </div>
          ) : null}

          <div className="mx-auto max-w-[720px] px-4 pb-14 pt-10 md:px-6 md:pb-[88px]">
            <ShareBox slug={post.slug} />
          </div>
        </article>

        {more.length > 0 && (
          <section aria-labelledby="keep-reading" className="bg-[#F4F6FA] py-12 md:py-[88px]">
            <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 md:px-6">
              <div className="flex items-center justify-between gap-4">
                <h2 id="keep-reading" className="font-display text-[26px] font-bold tracking-[-0.03em] md:text-[32px]">
                  Keep reading
                </h2>
                <Link href="/blog" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-extrabold text-brand-dark">
                  All posts
                  <HugeiconsIcon icon={ArrowRight02Icon} size={18} color="currentColor" aria-hidden />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
                {more.map((item) => {
                  const tag = topicOf(item)
                  return (
                    <Link
                      key={item._id}
                      href={`/blog/${item.slug}`}
                      className="group flex flex-col gap-3.5 rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-[#F4F6FA]"
                    >
                      <BlogCover post={item} className="aspect-[16/10] rounded-[20px]" />
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] text-muted">
                          <b style={{color: toneFor(tag).label}}>{tag}</b> · {item.readTime}
                        </span>
                        <h3 className="font-display text-[21px] font-bold leading-[1.15] tracking-[-0.02em] transition-colors group-hover:text-brand-dark">
                          {item.title}
                        </h3>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        <HostBand />
      </main>
      <Footer />
    </>
  )
}
