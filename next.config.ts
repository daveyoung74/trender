import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "sharp",
    "detect-libc",
    "mysql2",
    "@aws-sdk/client-s3",
    "@pump-fun/pump-sdk",
    "@solana/web3.js",
    "bullmq",
    "ioredis",
    "@solana/spl-token",
    "bn.js",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  async rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "./server/worker": false,
      };
    }
    return config;
  },
};

export default nextConfig;
