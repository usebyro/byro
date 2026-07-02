import type { NextConfig } from 'next'
import withBundleAnalyzer from '@next/bundle-analyzer'

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    domains: [
      'byro-32ux.onrender.com',
      'byro.onrender.com',
      'localhost',
     'www.usebyro.com',
     'usebyro.com'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'byro.onrender.com',
        pathname: '/**',
      },
    ],
  },
}

export default withAnalyzer(nextConfig)
