import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname, 
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'byro-32ux.onrender.com',
        pathname: '/**',
      },
    
      {
        protocol: 'https',
        hostname: 'byro.onrender.com',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'byro.africa',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'usebyro.com',
        pathname: '/**',
      },
    ],
  },
};

export default withAnalyzer(nextConfig);
