/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // CRITICAL: We must forward to the REAL remote backend here.
    // Do NOT use NEXT_PUBLIC_API_URL if it points to localhost (which it does now).
    const REMOTE_API_ROOT = "https://api.rx.dumostech.com";

    return [
      {
        source: "/api/v1/:path*",
        destination: `${REMOTE_API_ROOT}/api/v1/:path*`,
      },
      {
        // Fallback
        source: "/api/:path*",
        destination: `${REMOTE_API_ROOT}/api/v1/:path*`,
      },
      {
        source: "/sanctum/csrf-cookie",
        destination: `${REMOTE_API_ROOT}/sanctum/csrf-cookie`,
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
