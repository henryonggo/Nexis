import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@nexis/types",
    "@nexis/money",
    "@nexis/payroll",
    "@nexis/agent-tools",
    "@nexis/orchestrator",
  ],
  experimental: {
    // Keep the GCP client external so the (now lazy) dynamic import resolves from
    // node_modules instead of a webpack chunk.
    serverComponentsExternalPackages: ["@google-cloud/tasks"],
    // pnpm symlinks apps/web/node_modules/* into the monorepo .pnpm store. With
    // the default tracing root (apps/web) Next leaves that symlinked dir in the
    // serverless function output, which Vercel rejects ("invalid deployment
    // package ... symlinked directories"). Rooting tracing at the repo root makes
    // Next copy the real .pnpm files instead of the symlink.
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
};

export default withNextIntl(nextConfig);
