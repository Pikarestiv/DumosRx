/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // rewrites() are not supported in static export
  // async rewrites() {
  //   const REMOTE_API_ROOT = "https://api.rx.dumostech.com";
  //   return [
  //     {
  //       source: "/api/v1/:path*",
  //       destination: `${REMOTE_API_ROOT}/api/v1/:path*`,
  //     },
  //     {
  //       // Fallback
  //       source: "/api/:path*",
  //       destination: `${REMOTE_API_ROOT}/api/v1/:path*`,
  //     },
  //     {
  //       source: "/sanctum/csrf-cookie",
  //       destination: `${REMOTE_API_ROOT}/sanctum/csrf-cookie`,
  //     },
  //   ];
  // },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
