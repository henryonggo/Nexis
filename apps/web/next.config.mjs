import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
  },
};

export default withNextIntl(nextConfig);
