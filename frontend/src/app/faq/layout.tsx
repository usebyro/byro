import type {Metadata} from 'next'
import {FAQS} from '@/lib/faqs'
import {faqPageJsonLd, serializeJsonLd} from '@/lib/faqSchema'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to common questions about hosting events, buying tickets, payouts and refunds on Byro.',
  alternates: {canonical: '/faq'},
  openGraph: {
    title: 'FAQ | Byro',
    description: 'Answers to common questions about hosting events, buying tickets, payouts and refunds on Byro.',
  },
}

export default function Layout({children}: {children: React.ReactNode}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: serializeJsonLd(faqPageJsonLd(FAQS))}} />
      {children}
    </>
  )
}
