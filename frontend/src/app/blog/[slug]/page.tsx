import {PortableText, defineQuery, type SanityDocument} from 'next-sanity'
import {notFound} from 'next/navigation'
import {client} from '@/sanity/client'
import Link from 'next/link'
import type {Metadata} from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const POST_QUERY = defineQuery(
  `*[_type == "post" && slug.current == $slug][0]{ _id, title, body, excerpt, publishedAt }`
)

const options = {next: {revalidate: 30}}

type PageProps = {params: Promise<{slug: string}>}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const {slug} = await params
  const post = await client.fetch<SanityDocument | null>(POST_QUERY, {slug}, options)
  if (!post) return {title: 'Post Not Found'}

  return {
    title: post.title as string,
    description: (post.excerpt as string) || `${post.title} — Byro blog`,
  }
}

export default async function PostPage({params}: PageProps) {
  const {slug} = await params
  const post = await client.fetch<SanityDocument | null>(POST_QUERY, {slug}, options)

  if (!post) return notFound()

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F5F7FA]">
        <article className="max-w-3xl mx-auto px-4 py-12">
          <Link
            href="/blog"
            className="text-blue-600 hover:underline mb-8 inline-block text-sm font-medium"
          >
            ← Back to blog
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{post.title as string}</h1>
          {post.publishedAt && (
            <time className="text-gray-500 text-sm mb-8 block">
              {new Date(post.publishedAt as string).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
          <div className="bg-white border border-gray-200 rounded-2xl p-8">
            {Array.isArray(post.body) && <PortableText value={post.body} />}
          </div>
        </article>
      </div>
      <Footer />
    </>
  )
}
