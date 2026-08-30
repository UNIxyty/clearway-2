/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/profile", destination: "/account/profile", permanent: false },
      { source: "/settings/notifications", destination: "/account/notifications", permanent: false },
      { source: "/stats", destination: "/account/search-stats", permanent: false },
      { source: "/admin/country-service-status", destination: "/admin/service-status", permanent: false },
      { source: "/admin/debug/email-logs", destination: "/admin/email/logs", permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flagcdn.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
