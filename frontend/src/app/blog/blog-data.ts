import {client} from '@/sanity/client'
import {defineQuery, type SanityDocument} from 'next-sanity'
import type {TypedObject} from '@portabletext/types'

export type BlogPost = {
  _id: string
  title: string
  slug: string
  excerpt: string
  publishedAt: string
  readTime: string
  tags: string[]
  featured?: boolean
  authorName: string
  authorInitials: string
  coverImageUrl?: string
  body?: TypedObject[]
}

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    _createdAt,
    readTime,
    tags,
    featured,
    authorName,
    authorInitials,
    "coverImageUrl": coverImage.asset->url
  }`
)

const POST_QUERY = defineQuery(
  `*[_type == "post" && slug.current == $slug][0]{
    _id,
    title,
    "slug": slug.current,
    body,
    excerpt,
    publishedAt,
    _createdAt,
    readTime,
    tags,
    authorName,
    authorInitials,
    "coverImageUrl": coverImage.asset->url
  }`
)

const options = {next: {revalidate: 30}}

/** Sanity's read time is typed as "4 min"; show it as "4 min read". */
function readTimeLabel(value: unknown) {
  const text = String(value || '4 min').trim()
  return /read$/i.test(text) ? text : `${text} read`
}

function normalizePost(post: SanityDocument): BlogPost {
  const slug = typeof post.slug === 'string' ? post.slug : post.slug?.current

  return {
    _id: String(post._id),
    title: String(post.title || 'Untitled story'),
    slug: String(slug || post._id),
    excerpt: String(post.excerpt || ''),
    // No publish date set in Sanity: use when the post was created, so the date doesn't change on every visit.
    publishedAt: String(post.publishedAt || post._createdAt || new Date().toISOString()),
    readTime: readTimeLabel(post.readTime),
    tags: Array.isArray(post.tags) ? post.tags.map(String) : [],
    featured: Boolean(post.featured),
    authorName: String(post.authorName || '').trim() || 'Byro team',
    authorInitials: String(post.authorInitials || '').trim() || 'BT',
    coverImageUrl: typeof post.coverImageUrl === 'string' ? post.coverImageUrl : undefined,
    body: Array.isArray(post.body) ? post.body : undefined,
  }
}

export async function getBlogPosts() {
  try {
    const posts = await client.fetch<SanityDocument[]>(POSTS_QUERY, {}, options)
    return posts.map((post) => normalizePost(post))
  } catch {
    return []
  }
}

export async function getBlogPost(slug: string) {
  try {
    const post = await client.fetch<SanityDocument | null>(POST_QUERY, {slug}, options)
    if (post) return normalizePost(post)
  } catch {
    return null
  }

  return null
}

export function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})
}

export function formatLongDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})
}
