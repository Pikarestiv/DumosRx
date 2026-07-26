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
const devHost = localIps.length > 0 ? localIps[0] : "localhost";
// Tauri sets this on beforeDevCommand for `tauri android dev` / `tauri ios dev`.
// Only set assetPrefix in that case — the mobile webview loads pages from the
// LAN devUrl and needs an absolute prefix to resolve JS chunks/HMR correctly.
// Setting it unconditionally (including for plain `npm run dev`) broke Fast
// Refresh and caused a full reload on every navigation instead.
const isTauriMobileDev = process.env.TAURI_ENV_MOBILE === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Allow Tauri to load chunks properly if needed
  allowedDevOrigins: ["tauri.localhost", "localhost", "127.0.0.1", "10.0.2.2", ...localIps],
  assetPrefix: isTauriMobileDev ? `http://${devHost}:3000` : undefined,
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

export default nextConfig;
