import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'See how Byro pricing works for organisers and attendees. Free tickets stay free, and fees only apply when you sell paid tickets.',
  alternates: {canonical: '/pricing'},
  openGraph: {
    title: 'Pricing | Byro',
    description: 'See how Byro pricing works for organisers and attendees. Free tickets stay free, and fees only apply when you sell paid tickets.',
  },
}

export default function Layout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
