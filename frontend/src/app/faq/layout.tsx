import type {Metadata} from 'next'

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
  return <>{children}</>
}
