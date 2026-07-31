import {PortableText, defineQuery, type SanityDocument} from 'next-sanity'
import {notFound} from 'next/navigation'
import {client} from '@/sanity/client'
import Link from 'next/link'
import type {Metadata} from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const POST_QUERY = defineQuery(
  `*[_type == "post" && slug.current == $slug][0]{ _id, title, body, excerpt, publishedAt, readTime, category, authorName, authorInitials, coverImage }`
)

const RELATED_QUERY = defineQuery(
  `*[_type == "post" && slug.current != $slug] | order(publishedAt desc)[0...2]{ _id, title, slug, excerpt, readTime, authorName, authorInitials, coverImage }`
)

const options = {next: {revalidate: 30}}

type PageProps = {params: Promise<{slug: string}>}

function getInitialsColor(initials: string) {
  const colors: Record<string, string> = {
    AO: 'bg-purple-600',
    TB: 'bg-blue-600',
    ZM: 'bg-pink-600',
  }
  return colors[initials] || 'bg-gray-600'
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {slug} = await params
  const post = await client.fetch<SanityDocument | null>(POST_QUERY, {slug}, options)
  if (!post) return {title: 'Post Not Found'}

  return {
    title: post.title as string,
    description: (post.excerpt as string) || `${post.title} — Byro Journal`,
  }
}

export default async function PostPage({params}: PageProps) {
  const {slug} = await params
  const [post, relatedPosts] = await Promise.all([
    client.fetch<SanityDocument | null>(POST_QUERY, {slug}, options),
    client.fetch<SanityDocument[]>(RELATED_QUERY, {slug}, options),
  ])

  if (!post) return notFound()

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white">
        <article className="max-w-3xl mx-auto px-4 py-12">
          {/* Back link */}
          <Link href="/blog" className="text-sm font-medium text-gray-900 hover:text-blue-600 mb-8 inline-block">
            ← Back to journal
          </Link>

          {/* Category */}
          {post.category && (
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              {post.category.replace('-', ' ')}
            </span>
          )}

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mt-4 mb-6 leading-tight">
            {post.title as string}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${getInitialsColor(post.authorInitials)}`}>
                {post.authorInitials}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{post.authorName}</p>
              </div>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{new Date(post.publishedAt as string).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}</span>
              <span>·</span>
              <span>{post.readTime}</span>
            </div>
          </div>

          {/* Body */}
          <div className="prose prose-lg max-w-none">
            {Array.isArray(post.body) && <PortableText value={post.body} />}
          </div>
        </article>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <div className="border-t border-gray-100">
            <div className="max-w-6xl mx-auto px-4 py-16">
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Keep reading</h2>
              <div className="grid sm:grid-cols-2 gap-8">
                {relatedPosts.map((related) => (
                  <Link key={related._id} href={`/${related.slug?.current}`} className="group block">
                    <div className="aspect-[4/3] bg-gray-100 rounded-2xl overflow-hidden mb-4">
                      {related.coverImage && (
                        <img
                          src={related.coverImage.url || `/images/${related.slug?.current}.jpg`}
                          alt={related.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <span>{related.readTime}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {related.title}
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-2">{related.excerpt}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  )
}
