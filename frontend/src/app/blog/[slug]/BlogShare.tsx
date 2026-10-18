'use client'

import {useEffect, useRef, useState} from 'react'
import {toast} from 'sonner'
import {HugeiconsIcon} from '@hugeicons/react'
import {Link01Icon, Linkedin01Icon, NewTwitterIcon, Tick02Icon, WhatsappIcon} from '@hugeicons/core-free-icons'
import {withShareUtm} from '@/lib/analytics'
import {SITE_URL} from '@/lib/site'

const CAMPAIGN = 'blog_share'

/** The post's URL tagged for one channel, the same way the app's share menu tags event links. */
const shareLink = (slug: string, source: string) => withShareUtm(`${SITE_URL}/blog/${slug}`, CAMPAIGN, slug, source, source)

function useCopyLink(slug: string) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    navigator.clipboard
      .writeText(shareLink(slug, 'copy_link'))
      .then(() => {
        toast.success('Link copied')
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => toast.error("Couldn't copy link"))
  }
  return {copied, copy}
}

const press = 'transition-[transform,background-color,color] duration-150 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

/** Copy link + X, LinkedIn and WhatsApp, under the post's title. */
export function ShareRow({slug, title}: {slug: string; title: string}) {
  const {copied, copy} = useCopyLink(slug)
  const enc = encodeURIComponent
  const channels = [
    // Each in its own brand colour, as in the app's share menu.
    {label: 'Share on X', icon: NewTwitterIcon, color: '#000000', href: `https://twitter.com/intent/tweet?url=${enc(shareLink(slug, 'twitter'))}&text=${enc(title)}`},
    {label: 'Share on LinkedIn', icon: Linkedin01Icon, color: '#0A66C2', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareLink(slug, 'linkedin'))}`},
    {label: 'Share on WhatsApp', icon: WhatsappIcon, color: '#25D366', href: `https://wa.me/?text=${enc(`${title} ${shareLink(slug, 'whatsapp')}`)}`},
  ]

  return (
    <div role="group" aria-label="Share this post" className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full pl-3.5 pr-4 text-sm font-extrabold ${press} ${
          copied ? 'bg-good-tint text-good' : 'bg-[#F1F3F7] text-ink hover:bg-[#E6EAF1]'
        }`}
      >
        <HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} size={18} color="currentColor" aria-hidden />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {channels.map(({label, icon, color, href}) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={`inline-flex size-11 items-center justify-center rounded-full bg-[#F1F3F7] hover:bg-[#E6EAF1] ${press}`}
        >
          <HugeiconsIcon icon={icon} size={20} color={color} strokeWidth={1.8} aria-hidden />
        </a>
      ))}
    </div>
  )
}

/** "Found this useful?" box at the end of the post. */
export function ShareBox({slug}: {slug: string}) {
  const {copied, copy} = useCopyLink(slug)
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#F4F6FA] p-6">
      <div className="flex flex-col gap-1">
        <span className="font-display text-xl font-bold tracking-[-0.02em]">Found this useful?</span>
        <span className="text-[15px] text-body">Send it to someone hosting their first event.</span>
      </div>
      <button
        type="button"
        onClick={copy}
        className={`inline-flex min-h-12 items-center gap-2 rounded-full bg-ink pl-[18px] pr-5 text-sm font-extrabold text-white ${press}`}
      >
        <HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} size={18} color="currentColor" aria-hidden />
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  )
}
