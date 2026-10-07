import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './src/lib/security-headers';

const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          apiOrigin,
          isProduction: process.env.NODE_ENV === 'production',
        }),
      },
    ];
  },
};

export default nextConfig;
