import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2 Storage
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      // R2 public bucket URL (pub-*.r2.dev)
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      // Supabase Storage (for backwards compatibility with existing files)
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
