import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexis/types", "@nexis/money", "@nexis/payroll"],
  // Keep the GCP client out of the webpack bundle: it lazily require()s runtime
  // config JSON (cloud_tasks_client_config.json) that Next's output tracing
  // misses, so bundling it 500s the route with MODULE_NOT_FOUND. As an external
  // package it loads from node_modules, where those assets resolve and Vercel
  // traces them.
  experimental: {
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
