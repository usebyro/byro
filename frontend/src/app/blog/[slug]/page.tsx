import type {Metadata} from 'next'
import Link from 'next/link'
import {PortableText} from 'next-sanity'
import {ChevronLeft, Heart} from 'lucide-react'
import {notFound} from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import BlogShareButton from './BlogShareButton'
import {
  formatLongDate,
  getBlogPost,
  getBlogPosts,
  initialsGradient,
} from '../blog-data'
import type {BlogPost} from '../blog-data'

type PageProps = {params: Promise<{slug: string}>}

function BlogImage({post, className = ''}: {post: BlogPost; className?: string}) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${post.gradient} ${className}`}>
      {post.coverImageUrl && <img src={post.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_36%,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_16%_82%,rgba(19,33,36,0.42),transparent_34%)]" />
    </div>
  )
}

function Avatar({post}: {post: BlogPost}) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${initialsGradient(
        post.authorInitials
      )} text-sm font-black text-white shadow-sm`}
    >
      {post.authorInitials}
    </span>
  )
}

function FallbackArticle() {
  return (
    <div className="space-y-8 text-[18px] leading-8 text-[#68738f]">
      <p>
        The difference between a half-full room and a sold-out night often comes down to one thing: how you
        structure your ticket tiers. Get it right and you capture every segment of demand. Get it wrong and
        you leave money — or worse, atmosphere — on the table.
      </p>

      <section>
        <h2 className="mb-3 font-serif text-[29px] font-black leading-tight text-[#10182f]">Start with three, never five</h2>
        <p>
          Most first-time organizers over-segment. Five tiers feels generous; in practice it paralyzes buyers.
          Three is the sweet spot: an accessible General Admission, an aspirational VIP, and a premium Table or
          Box for groups who want to be seen.
        </p>
      </section>

      <blockquote className="rounded-r-xl border-l-4 border-[#4f84ff] bg-white px-7 py-6 font-serif text-[22px] font-black italic leading-8 text-[#10182f]">
        &quot;Price the cheapest tier so it sells out first. Scarcity at the bottom pushes everyone up.&quot;
      </blockquote>

      <section>
        <h2 className="mb-3 font-serif text-[29px] font-black leading-tight text-[#10182f]">Let the floor create the urgency</h2>
        <p>
          When General Admission shows “340 left” and ticks down in real time, the VIP tier suddenly looks like
          the safe choice. Byro surfaces live inventory on every event page — use it.
        </p>
      </section>

      <p>
        Set your tiers, watch the data, and adjust. The best promoters treat pricing as a living thing, not a
        one-time decision.
      </p>
    </div>
  )
}

function RelatedCard({post}: {post: BlogPost}) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-[#ced8ef] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <BlogImage post={post} className="h-[64px] w-[64px] shrink-0 rounded-lg" />
      <div>
        <h3 className="text-[15px] font-black leading-5 text-[#1b2540] transition group-hover:text-[#4f84ff]">{post.title}</h3>
        <p className="mt-1 text-sm text-[#9aa4bd]">{post.readTime}</p>
      </div>
    </Link>
  )
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) return {title: 'Post Not Found'}

  return {
    title: post.title,
    description: post.excerpt || `${post.title} — Byro Journal`,
  }
}

export default async function PostPage({params}: PageProps) {
  const {slug} = await params
  const [post, posts] = await Promise.all([getBlogPost(slug), getBlogPosts()])

  if (!post) return notFound()

  const relatedPosts = posts.filter((item) => item.slug !== post.slug && !item.featured).slice(0, 2)
  const tag = post.tags[0] || 'Journal'

  return (
    <>
      <Navbar />
      <main className="bg-[#f3f6ff] text-[#10182f]">
        <article className="mx-auto max-w-[680px] px-6 py-12 lg:px-0">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-bold text-[#76829d] hover:text-[#4f84ff]">
              <ChevronLeft size={16} />
              Back to journal
            </Link>
            <span className="rounded-full bg-[#dce8ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#4f84ff]">
              {tag}
            </span>
          </div>

          <h1 className="font-serif text-[42px] font-black leading-[1.02] tracking-[-0.02em] text-[#10182f] sm:text-[48px]">
            {post.title}
          </h1>

          <div className="mt-6 flex items-center justify-between border-b border-[#dce3f3] pb-8">
            <div className="flex items-center gap-4">
              <Avatar post={post} />
              <div>
                <p className="text-sm font-black text-[#1b2540]">{post.authorName}</p>
                <p className="text-sm text-[#9aa4bd]">
                  {formatLongDate(post.publishedAt)} · {post.readTime}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <BlogShareButton slug={post.slug} title={post.title} />
              <button aria-label="Save post" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e0f2] text-[#76829d]">
                <Heart size={18} />
              </button>
            </div>
          </div>

          <BlogImage post={post} className="mt-8 h-[285px] rounded-2xl sm:h-[304px]" />

          <div className="mt-8">
            {post.body?.length ? (
              <div className="prose prose-lg max-w-none prose-headings:font-serif prose-headings:text-[#10182f] prose-p:text-[#68738f] prose-p:leading-8 prose-blockquote:rounded-r-xl prose-blockquote:border-l-[#4f84ff] prose-blockquote:bg-white prose-blockquote:px-7 prose-blockquote:py-5 prose-blockquote:font-serif prose-blockquote:text-[#10182f]">
                <PortableText value={post.body} />
              </div>
            ) : (
              <FallbackArticle />
            )}
          </div>

          <section className="mt-12">
            <h2 className="mb-5 font-serif text-[27px] font-black text-[#10182f]">Keep reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {relatedPosts.map((item) => (
                <RelatedCard key={item._id} post={item} />
              ))}
            </div>
          </section>
        </article>
      </main>
      <Footer />
    </>
  )
}
