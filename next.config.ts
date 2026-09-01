import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a slim Docker image (used by the
  // local test stack in docker-compose; Vercel ignores this).
  output: 'standalone',
};

export default nextConfig;
