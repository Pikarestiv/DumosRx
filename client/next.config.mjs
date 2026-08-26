import { withSentryConfig } from "@sentry/nextjs";
import os from "os";

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const localIps = getLocalIps();
// Tauri sets TAURI_DEV_HOST to the LAN IP when running `tauri android dev` /
// `tauri ios dev` (this is the documented mechanism, not a guess). Only set
// assetPrefix when it's present: the mobile webview loads pages from the LAN
// devUrl and needs an absolute prefix to resolve JS chunks/HMR correctly.
// Setting it unconditionally (including for plain `npm run dev`) broke Fast
// Refresh and caused a full reload on every navigation instead.
const tauriDevHost = process.env.TAURI_DEV_HOST;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Allow Tauri to load chunks properly if needed
  allowedDevOrigins: ["tauri.localhost", "localhost", "127.0.0.1", "10.0.2.2", ...localIps],
  assetPrefix: tauriDevHost ? `http://${tauriDevHost}:3000` : undefined,
  // rewrites() are not supported in static export
  // async rewrites() {
  //   const REMOTE_API_ROOT = "https://api.dumosrx.com";
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
  async headers() {
    return [
      {
        source: "/(.*).wasm",
        headers: [
          {
            key: "Content-Type",
            value: "application/wasm",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "dumos-technologies",

  project: "dumosrx-client",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
