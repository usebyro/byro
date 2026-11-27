import {getBlogPost} from '../../blog-data'
import {blogCard} from '@/lib/og/cards'
import {ogResponse, notFound} from '@/lib/og/respond'

// The link-preview image for a post that has no cover image: its title on Byro blue.
export async function GET(_request: Request, {params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) return notFound()
  const card = {label: post.tags[0] || 'Blog', headline: post.title, footer: 'usebyro.com/blog'}
  return ogResponse(`/blog-card?${new URLSearchParams(card)}`, (ImageResponse: unknown) => blogCard(ImageResponse, card))
}
