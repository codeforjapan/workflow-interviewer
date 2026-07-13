import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // KB は実行時に docs/kb 配下を fs から readdir/readFile するため、
  // サーバーレス関数のトレースに明示的に含める (Vercel で自動検出されない)。
  outputFileTracingIncludes: {
    "/api/**": ["./docs/kb/**/*"],
    "/sessions/**": ["./docs/kb/**/*"],
  },
};

export default nextConfig;
