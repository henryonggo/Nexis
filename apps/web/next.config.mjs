/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexis/types", "@nexis/money", "@nexis/payroll"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
