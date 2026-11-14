import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  env: { NEXT_PUBLIC_STOREFRONT_SANDBOX: process.env.STOREFRONT_ALLOW_EMPTY ?? "" },
  images: {
    unoptimized: true,
  },
  // Ensure trailing slashes for direct FTP hosting compatibility
  trailingSlash: true,
};

export default nextConfig;
