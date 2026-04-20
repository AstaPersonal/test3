import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow dev connections from network IP addresses */
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
