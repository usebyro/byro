import type {Metadata} from 'next'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import {fallbackPosts, formatShortDate, getBlogPosts, initialsGradient} from './blog-data'
import type {BlogPost} from './blog-data'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Stories from the scene — guides for organizers, what-is-on roundups, and the culture behind the events.',
}

const filters = ['All', 'For organizers', 'Music', 'Nightlife', 'Sports', 'Product']

function BlogImage({post, className = ''}: {post: BlogPost; className?: string}) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${post.gradient} ${className}`}>
      {post.coverImageUrl && <img src={post.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_36%,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_18%_88%,rgba(255,92,153,0.35),transparent_34%)]" />
    </div>
  )
}

function Tag({children, tone = 'blue'}: {children: React.ReactNode; tone?: 'blue' | 'pink' | 'teal' | 'purple'}) {
  const tones = {
    blue: 'border-[#5284ff]/40 bg-[#5284ff]/10 text-[#5284ff]',
    pink: 'border-[#ff609b]/40 bg-[#ff609b]/10 text-[#ff609b]',
    teal: 'border-[#00b6a8]/40 bg-[#00b6a8]/10 text-[#00a899]',
    purple: 'border-[#8f61ff]/40 bg-[#8f61ff]/10 text-[#8f61ff]',
  }

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`}>
      {children}
    </span>
  )
}

function Avatar({post}: {post: BlogPost}) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${initialsGradient(
        post.authorInitials
      )} text-[11px] font-black text-white shadow-sm`}
    >
      {post.authorInitials}
    </span>
  )
}

function PostCard({post, index}: {post: BlogPost; index: number}) {
  const tone = index === 0 ? 'pink' : index === 1 ? 'teal' : 'purple'

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group overflow-hidden rounded-2xl border border-[#ced8ef] bg-white shadow-[0_8px_24px_rgba(36,57,107,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(36,57,107,0.12)]"
    >
      <div className="relative h-[150px] sm:h-[168px]">
        <BlogImage post={post} className="h-full w-full" />
        <div className="absolute left-4 top-4">
          <Tag tone={tone}>{post.tags[0] || 'Journal'}</Tag>
        </div>
      </div>
      <div className="p-5">
        <p className="mb-3 text-[13px] text-[#8793b0]">
          {formatShortDate(post.publishedAt)} · {post.readTime.replace(' read', '')}
        </p>
        <h3 className="font-serif text-[21px] font-black leading-[1.12] text-[#10182f] transition group-hover:text-[#4f84ff]">
          {post.title}
        </h3>
        <p className="mt-3 min-h-[44px] text-[15px] leading-6 text-[#59647f]">{post.excerpt}</p>
        <div className="mt-5 flex items-center gap-3">
          <Avatar post={post} />
          <span className="text-sm font-bold text-[#56617d]">{post.authorName}</span>
        </div>
      </div>
    </Link>
  )
}

export default async function BlogPage() {
  const posts = await getBlogPosts()
  const featured = posts.find((post) => post.featured) || posts[0] || fallbackPosts[0]
  const regular = posts.filter((post) => post.slug !== featured.slug)
  const cardPosts = regular.length ? regular.slice(0, 3) : fallbackPosts.slice(1)

  return (
    <>
      <Navbar />
      <main className="bg-[#f3f6ff] text-[#10182f]">
        <section className="mx-auto max-w-[1240px] px-6 pb-8 pt-12 lg:px-8 lg:pt-14">
          <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#4f84ff]">The Byro Journal</p>
          <h1 className="mt-5 font-serif text-[42px] font-black leading-[0.98] tracking-[-0.02em] sm:text-[54px]">
            Stories from the <span className="italic text-[#4f84ff]">scene</span>
          </h1>
          <p className="mt-5 max-w-3xl text-[17px] leading-7 text-[#52607e]">
            Guides for organizers, what is-on roundups, and the culture behind the events.
          </p>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 lg:px-8">
          <Link
            href={`/blog/${featured.slug}`}
            className="group grid overflow-hidden rounded-3xl border border-[#cbd6ed] bg-white shadow-[0_14px_32px_rgba(28,42,88,0.12)] md:grid-cols-[46%_54%]"
          >
            <div className="relative min-h-[250px] md:min-h-[300px]">
              <BlogImage post={featured} className="h-full w-full" />
              <div className="absolute left-5 top-5">
                <Tag>Featured</Tag>
              </div>
            </div>
            <div className="flex flex-col justify-center p-8 md:p-10">
              <p className="mb-4 text-[14px] text-[#8793b0]">
                {formatShortDate(featured.publishedAt)} · {featured.readTime}
              </p>
              <h2 className="max-w-2xl font-serif text-[31px] font-black leading-[1.04] tracking-[-0.01em] text-[#10182f] transition group-hover:text-[#4f84ff] sm:text-[37px]">
                {featured.title}
              </h2>
              <p className="mt-5 max-w-2xl text-[16px] leading-7 text-[#52607e]">{featured.excerpt}</p>
              <div className="mt-7 flex items-center gap-4">
                <Avatar post={featured} />
                <div>
                  <p className="text-sm font-black text-[#1d273f]">{featured.authorName}</p>
                  <p className="text-sm text-[#9aa4bd]">{featured.authorRole || 'Editor, The Byro Journal'}</p>
                </div>
              </div>
            </div>
          </Link>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-9 lg:px-8">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {filters.map((filter, index) => (
              <button
                key={filter}
                className={`shrink-0 rounded-full border px-5 py-2 text-sm font-bold ${
                  index === 0
                    ? 'border-[#4f84ff] bg-[#4f84ff] text-white'
                    : 'border-[#cbd6ed] bg-white text-[#52607e]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {cardPosts.map((post, index) => (
              <PostCard key={post._id} post={post} index={index} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
