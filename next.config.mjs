/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-lib"],
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  },
  async redirects() {
    return [
      {
        source: '/dashboard/:slug/:subpath*',
        destination: '/:slug/:subpath*',
        permanent: false,
      },
      {
        source: '/dashboard/:slug',
        destination: '/:slug',
        permanent: false,
      },
      {
        source: '/dashboard',
        destination: '/demo',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
