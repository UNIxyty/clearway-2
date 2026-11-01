/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Build-time, inlined as a literal: "1" only in the rig's own build (rig/build-portal.sh). Code behind it — the rig
  // switch that turns the middleware's client block off — is dead in every other build and the minifier drops it;
  // scripts/check-image-contents.mjs fails a built image that still names the switch (2026-11-02).
  env: { CW_RIG_BUILD: process.env.CW_RIG_BUILD === "1" ? "1" : "0" },
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
