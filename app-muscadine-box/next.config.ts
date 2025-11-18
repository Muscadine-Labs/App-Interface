import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Exclude system directories from watching
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/.Trash/**",
        "**/Library/**",
        "**/.Trash-*/**",
      ],
    };
    return config;
  },
  experimental: {
    turbo: {
      // Turbopack configuration to prevent scanning system directories
      resolveExtensions: [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".json",
        ".mjs",
        ".cjs",
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.alchemyapi.io",
      },
    ],
  },
};

export default nextConfig;