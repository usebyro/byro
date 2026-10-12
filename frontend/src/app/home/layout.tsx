import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Events near you',
  description: 'Browse what is on in your city and find communities worth following on Byro.',
  alternates: {canonical: '/home'},
  openGraph: {
    title: 'Events near you | Byro',
    description: 'Browse what is on in your city and find communities worth following on Byro.',
  },
}

export default function Layout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
