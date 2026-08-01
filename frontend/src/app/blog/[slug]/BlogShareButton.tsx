'use client'

import {Share2} from 'lucide-react'
import ShareMenu from '@/components/ShareMenu'

export default function BlogShareButton({slug, title}: {slug: string; title: string}) {
  const url = `https://usebyro.com/blog/${slug}`

  return (
    <ShareMenu
      url={url}
      title={title}
      campaign="blog_share"
      content={slug}
      onShare={() => {}}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e0f2] text-[#76829d] hover:bg-gray-50 transition-colors">
        <Share2 size={18} />
      </span>
    </ShareMenu>
  )
}
