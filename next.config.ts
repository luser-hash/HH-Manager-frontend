import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  experimental: { proxyClientMaxBodySize: '260mb', proxyTimeout: 660000 },
  async rewrites() {
    return [{ source: '/api/:path*/', destination: `${process.env.DJANGO_API_ORIGIN || 'http://127.0.0.1:8000'}/api/:path*/` }];
  },
};

export default config;
