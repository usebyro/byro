import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Discover Events',
  description: 'Find concerts, sports, nightlife and conferences in Lagos. Book tickets in seconds on Byro.',
  openGraph: {
    title: 'Discover Events | Byro',
    description: 'Find concerts, sports, nightlife and conferences in Lagos. Book tickets in seconds on Byro.',
  },
}

export default function DiscoverLayout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
