import Link from 'next/link'
import {HugeiconsIcon} from '@hugeicons/react'
import {Clock01Icon} from '@hugeicons/core-free-icons'
import type {BlogPost} from './blog-data'

/** Each topic gets one of the brand tints; the label colour is the darker one that passes contrast on white. */
const TONES = [
  {match: /organi[sz]/i, tint: '#E6F2FC', ink: '#3669F6', label: '#2451D6'},
  {match: /product|news|update/i, tint: '#E9F7EF', ink: '#2F9E6E', label: '#1F6B47'},
  {match: /communit/i, tint: '#FCECEE', ink: '#D0668E', label: '#A3365F'},
  {match: /$^/, tint: '#FFFDE9', ink: '#C9971C', label: '#8A5A00'},
]

export function toneFor(tag: string) {
  const known = TONES.find((t) => t.match.test(tag))
  if (known) return known
  const hash = [...tag].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return TONES[hash % TONES.length]
}

export const topicOf = (post: BlogPost) => post.tags[0] || 'Byro'

/** The post's cover photo, or its topic tint with the title's first letter when there isn't one. */
export function BlogCover({post, className = '', markClassName = 'text-[44px]'}: {post: BlogPost; className?: string; markClassName?: string}) {
  const tone = toneFor(topicOf(post))
  return (
    <div className={`relative overflow-hidden ${className}`} style={{background: tone.tint}}>
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className={`absolute bottom-[0.4em] left-[0.4em] font-display font-extrabold leading-[0.9] tracking-[-0.05em] ${markClassName}`}
          style={{color: tone.ink}}
        >
          {post.title.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export function TopicPill({tag}: {tag: string}) {
  const tone = toneFor(tag)
  return (
    <span
      className="inline-flex min-h-7 items-center self-start rounded-full px-3 text-[13px] font-extrabold"
      style={{background: tone.tint, color: tone.label}}
    >
      {tag}
    </span>
  )
}

export function ReadTime({value, size = 16}: {value: string; size?: number}) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <HugeiconsIcon icon={Clock01Icon} size={size} color="currentColor" aria-hidden />
      {value}
    </span>
  )
}

export function HostBand() {
  return (
    <section aria-labelledby="host" className="flex flex-col items-center gap-5 bg-ink px-4 py-16 text-center text-white md:py-[104px]">
      <h2 id="host" className="font-display text-[32px] font-bold tracking-[-0.035em] md:text-5xl">
        Ready to host?
      </h2>
      <p className="max-w-[36ch] text-[17px] leading-normal text-[#C9CFDA]">
        Free events cost nothing. Paid events have a small fee per ticket.
      </p>
      <Link
        href="/events/create"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-[22px] text-base font-bold text-white transition-[transform,background-color] duration-150 hover:bg-[#2F5EE0] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        Create an event
      </Link>
    </section>
  )
}
