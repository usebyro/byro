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
  authorRole?: string
  coverImageUrl?: string
  gradient: string
  body?: TypedObject[]
}

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
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
    readTime,
    tags,
    authorName,
    authorInitials,
    "coverImageUrl": coverImage.asset->url
  }`
)

const options = {next: {revalidate: 30}}

const gradients = [
  'from-[#16052f] via-[#55269d] to-[#8638f2]',
  'from-[#180731] via-[#5a28b1] to-[#d653a8]',
  'from-[#00372e] via-[#027b68] to-[#08c7b7]',
  'from-[#3d124b] via-[#a02c67] to-[#d85dc5]',
]

function normalizePost(post: SanityDocument, index = 0): BlogPost {
  const slug = typeof post.slug === 'string' ? post.slug : post.slug?.current

  return {
    _id: String(post._id),
    title: String(post.title || 'Untitled story'),
    slug: String(slug || post._id),
    excerpt: String(post.excerpt || ''),
    publishedAt: String(post.publishedAt || new Date().toISOString()),
    readTime: String(post.readTime || '4 min read'),
    tags: Array.isArray(post.tags) ? post.tags.map(String) : [],
    featured: Boolean(post.featured),
    authorName: String(post.authorName || 'Byro Editorial'),
    authorInitials: String(post.authorInitials || 'BE'),
    authorRole: 'Editor, The Byro Journal',
    coverImageUrl: typeof post.coverImageUrl === 'string' ? post.coverImageUrl : undefined,
    gradient: gradients[index % gradients.length],
    body: Array.isArray(post.body) ? post.body : undefined,
  }
}

export async function getBlogPosts() {
  try {
    const posts = await client.fetch<SanityDocument[]>(POSTS_QUERY, {}, options)
    return posts.map(normalizePost)
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

export function initialsGradient(initials: string) {
  const colors: Record<string, string> = {
    AO: 'from-[#ff5e9e] to-[#7d46ff]',
    TB: 'from-[#45a6ff] to-[#00c8b8]',
    ZM: 'from-[#f160ad] to-[#9257ff]',
  }

  return colors[initials] || 'from-[#5b7cff] to-[#7f5cff]'
}
