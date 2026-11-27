import {blogCard} from '@/lib/og/cards'
import {ogResponse} from '@/lib/og/respond'

// The link-preview image for /blog.
export function GET() {
  const card = {label: 'Blog', headline: 'Guides for running events, and news from Byro', footer: 'usebyro.com/blog'}
  return ogResponse(`/blog-card?${new URLSearchParams(card)}`, (ImageResponse: unknown) => blogCard(ImageResponse, card))
}
