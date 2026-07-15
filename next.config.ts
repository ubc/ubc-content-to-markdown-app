import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["ubc-genai-toolkit-document-parsing"],
};

export default nextConfig;
