'use client'

import {useState} from 'react'
import Link from 'next/link'
import {formatShortDate} from './blog-data'
import type {BlogPost} from './blog-data'
import {BlogCover, toneFor, topicOf} from './blog-ui'

/** "All posts": a topic filter (built from the posts' own first tags) over a card grid. */
export default function BlogGrid({posts}: {posts: BlogPost[]}) {
  const topics = ['All', ...new Set(posts.map(topicOf))]
  const [topic, setTopic] = useState('All')
  const shown = topic === 'All' ? posts : posts.filter((p) => topicOf(p) === topic)

  return (
    <section aria-labelledby="all-posts" className="bg-[#F4F6FA] py-12 md:py-[88px]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-7 px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="all-posts" className="font-display text-[28px] font-bold tracking-[-0.03em] md:text-4xl">
            All posts
          </h2>
          <span aria-live="polite" className="text-sm tabular-nums text-muted">
            {shown.length === 1 ? '1 post' : `${shown.length} posts`}
          </span>
        </div>

        {topics.length > 2 && (
          <div role="group" aria-label="Filter by topic" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-6 md:px-6">
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={topic === t}
                onClick={() => setTopic(t)}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  topic === t ? 'bg-ink text-white' : 'bg-white text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((post) => {
            const tag = topicOf(post)
            return (
              <Link
                key={post._id}
                href={`/blog/${post.slug}`}
                className="group flex flex-col gap-4 rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-[#F4F6FA]"
              >
                <div className="overflow-hidden rounded-[20px]">
                  <BlogCover post={post} className="aspect-[16/10] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-[1.02]" />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span className="font-extrabold" style={{color: toneFor(tag).label}}>{tag}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatShortDate(post.publishedAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readTime}</span>
                  </p>
                  <h3 className="text-balance font-display text-[22px] font-bold leading-[1.15] tracking-[-0.02em] transition-colors group-hover:text-brand-dark">
                    {post.title}
                  </h3>
                  {post.excerpt && <p className="text-[15px] leading-[1.55] text-body">{post.excerpt}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
