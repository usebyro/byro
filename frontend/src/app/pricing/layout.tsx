import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Byro is free to use. Free events cost nothing for you or your guests, and paid events have a small fee per ticket sold.',
  alternates: {canonical: '/pricing'},
  openGraph: {
    title: 'Pricing | Byro',
    description: 'Byro is free to use. Free events cost nothing for you or your guests, and paid events have a small fee per ticket sold.',
  },
}

export default function Layout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
