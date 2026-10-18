import {shareCard} from '../share-card'

// The link-preview image for /blog.
export function GET() {
  return shareCard({label: 'Blog', headline: 'Guides for running events, and news from Byro', footer: 'usebyro.com/blog'})
}
