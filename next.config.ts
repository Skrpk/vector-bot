import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output is only for the local Docker image (docker-compose). On
  // Vercel it conflicts with Vercel's own output tracing (missing *.nft.json →
  // build error), so disable it there — Vercel packages the app itself.
  output: process.env.VERCEL ? undefined : 'standalone',
};

export default nextConfig;
