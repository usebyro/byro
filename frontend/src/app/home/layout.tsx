import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Your events',
  description: 'Your tickets and the events you host on Byro.',
  alternates: {canonical: '/home'},
  openGraph: {
    title: 'Your events | Byro',
    description: 'Your tickets and the events you host on Byro.',
  },
}

export default function Layout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
