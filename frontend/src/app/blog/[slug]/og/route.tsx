import {getBlogPost} from '../../blog-data'
import {shareCard} from '../../share-card'

// The link-preview image for a post that has no cover image: its title on Byro blue.
export async function GET(_request: Request, {params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) return new Response('Not found', {status: 404})
  return shareCard({label: post.tags[0] || 'Blog', headline: post.title, footer: 'usebyro.com/blog'})
}
