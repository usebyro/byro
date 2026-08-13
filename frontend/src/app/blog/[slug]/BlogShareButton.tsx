'use client'

import {HugeiconsIcon} from '@hugeicons/react'
import {Share02Icon} from '@hugeicons/core-free-icons'
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
        <HugeiconsIcon icon={Share02Icon} size={18} color="currentColor" />
      </span>
    </ShareMenu>
  )
}
