import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexis/types", "@nexis/money", "@nexis/payroll"],
  experimental: {
    // Keep the GCP client external so the (now lazy) dynamic import resolves from
    // node_modules instead of a webpack chunk.
    serverComponentsExternalPackages: ["@google-cloud/tasks"],
    // Best-effort: force-trace the package's runtime JSON config (loaded via a
    // computed require() the tracer can't follow) into the function bundle, so
    // the queue path works when Cloud Tasks is configured. The lazy import in
    // lib/cloud-tasks.ts is the real guard — if this trace still misses, the
    // enqueue degrades to a soft, retryable error rather than a 500.
    outputFileTracingIncludes: {
      "/**": ["./node_modules/@google-cloud/tasks/build/**/*.json"],
    },
  },
};

export default withNextIntl(nextConfig);
