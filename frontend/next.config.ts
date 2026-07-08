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
        hostname: 'www.usebyro.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'usebyro.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'fzskkmpslegcicobaamt.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

export default withAnalyzer(nextConfig);
