/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The standalone output is the app and what it needs at run time. Some routes read files under process.cwd(), so
  // file tracing otherwise copies the whole working folder in: the git history, agent worktrees, scraper downloads,
  // the rig's scratch space and Python environments (4.4 GB on a dev machine, and into the portal image).
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        ".git/**", ".claude/**", ".agents/**", ".cursor/**", ".venv/**",
        "rig/**", "downloads/**", "out/**", "test-results/**",
        "brag-output*/**", "cursor-chat-export/**", "design_handoff_*/**",
      ],
    },
  },
  async redirects() {
    return [
      { source: "/profile", destination: "/account/profile", permanent: false },
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
