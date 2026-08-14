import type {Metadata} from 'next'

export const metadata: Metadata = {
  title: 'Communities',
  description: 'Find the communities behind your favourite events on Byro. Follow the groups shaping your city and never miss what they\'re planning next.',
  openGraph: {
    title: 'Communities | Byro',
    description: 'Find the communities behind your favourite events on Byro. Follow the groups shaping your city and never miss what they\'re planning next.',
  },
}

export default function CommunitiesLayout({children}: {children: React.ReactNode}) {
  return <>{children}</>
}
