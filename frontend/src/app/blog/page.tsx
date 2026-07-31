import {client} from '@/sanity/client'
import {defineQuery, type SanityDocument} from 'next-sanity'
import Link from 'next/link'
import type {Metadata} from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Stories from the scene — guides for organizers, what-is-on roundups, and the culture behind the events.',
}

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(publishedAt desc){ _id, title, slug, excerpt, publishedAt, readTime, category, featured, authorName, authorInitials, coverImage }`
)

const options = {next: {revalidate: 30}}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})
}

function getInitialsColor(initials: string) {
  const colors: Record<string, string> = {
    AO: 'bg-purple-600',
    TB: 'bg-blue-600',
    ZM: 'bg-pink-600',
  }
  return colors[initials] || 'bg-gray-600'
}

export default async function BlogPage() {
  const posts = await client.fetch<SanityDocument[]>(POSTS_QUERY, {}, options)
  const featured = posts.find((p) => p.featured)
  const regular = posts.filter((p) => !p.featured)

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white">
        {/* Hero */}
        <div className="max-w-6xl mx-auto px-4 pt-16 pb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">The Byro Journal</h1>
          <p className="text-gray-500 mt-4 text-lg max-w-2xl">
            Stories from the scene. Guides for organizers, what-is-on roundups, and the culture behind the events.
          </p>
        </div>

        {/* Featured */}
        {featured && (
          <div className="max-w-6xl mx-auto px-4 pb-12">
            <Link href={`/${featured.slug?.current}`} className="block group">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="aspect-[4/3] bg-gray-100 rounded-2xl overflow-hidden">
                  {featured.coverImage && (
                    <img
                      src={featured.coverImage.url || `/images/${featured.slug?.current}.jpg`}
                      alt={featured.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Featured</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-2 mb-4">
                    <span>{formatDate(featured.publishedAt)}</span>
                    <span>·</span>
                    <span>{featured.readTime}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">
                    {featured.title}
                  </h2>
                  <p className="text-gray-600 mb-6 line-clamp-3">{featured.excerpt}</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${getInitialsColor(featured.authorInitials)}`}>
                      {featured.authorInitials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{featured.authorName}</p>
                      <p className="text-xs text-gray-500">Editor, The Byro Journal</p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Category tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['All', 'For organizers', 'Music', 'Nightlife', 'Sports', 'Product'].map((cat) => (
              <span
                key={cat}
                className="px-4 py-2 text-sm font-medium rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Posts grid */}
        <div className="max-w-6xl mx-auto px-4 pb-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {regular.map((post) => (
              <Link key={post._id} href={`/${post.slug?.current}`} className="group block">
                <div className="aspect-[4/3] bg-gray-100 rounded-2xl overflow-hidden mb-4">
                  {post.coverImage && (
                    <img
                      src={post.coverImage.url || `/images/${post.slug?.current}.jpg`}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                </div>
                <div className="flex gap-2 mb-2">
                  {post.category && (
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                      {post.category.replace('-', ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span>{formatDate(post.publishedAt)}</span>
                  <span>·</span>
                  <span>{post.readTime}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${getInitialsColor(post.authorInitials)}`}>
                    {post.authorInitials}
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{post.authorName}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
