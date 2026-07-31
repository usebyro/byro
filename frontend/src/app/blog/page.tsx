import {client} from '@/sanity/client'
import {defineQuery, type SanityDocument} from 'next-sanity'
import Link from 'next/link'
import type {Metadata} from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Latest news, updates, and stories from Byro — the community events platform.',
}

const POSTS_QUERY = defineQuery(
  `*[_type == "post" && defined(slug.current)] | order(_createdAt desc){ _id, title, slug, excerpt }`
)

const options = {next: {revalidate: 30}}

export default async function BlogPage() {
  const posts = await client.fetch<SanityDocument[]>(POSTS_QUERY, {}, options)

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F5F7FA]">
        <div className="max-w-4xl mx-auto px-4 pt-16 pb-12">
          <span className="text-blue-600 text-xs font-semibold tracking-widest uppercase">
            Blog
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mt-3 leading-tight">
            From the <span className="text-blue-500 italic font-bold">Byro</span> team
          </h1>
          <p className="text-gray-500 mt-4 text-base">
            News, updates, and stories.
          </p>
        </div>

        <div className="max-w-4xl mx-auto px-4 pb-16">
          {posts.length === 0 ? (
            <p className="text-gray-500 text-center">No posts yet. Add content in Sanity Studio.</p>
          ) : (
            <ul className="space-y-6">
              {posts.map((post) => (
                <li key={post._id}>
                  <Link
                    href={`/blog/${(post.slug as {current?: string})?.current}`}
                    className="block bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow"
                  >
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      {post.title as string}
                    </h2>
                    {post.excerpt && (
                      <p className="text-gray-500">{post.excerpt as string}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Footer />
    </>
  )
}
