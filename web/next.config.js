/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Packages we don't want webpack to bundle for serverless functions:
    //   • better-sqlite3 — native binding, the .node binary won't load
    //     if bundled.
    //   • @gensyn-ai/gensyn-delphi-sdk + @coinbase/cdp-sdk — the Coinbase
    //     SDK has optional deps (bs58, etc.) that webpack tries to
    //     resolve and fails. We only use the read-only REST surface
    //     (fetchMarket); leaving these external keeps Node's runtime
    //     resolver happy without needing to install the optional deps.
    //   • @delphi-duel/sdk — our wrapper around the above; same logic.
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "@delphi-duel/sdk",
      "@gensyn-ai/gensyn-delphi-sdk",
      "@coinbase/cdp-sdk",
    ],
  },
};
module.exports = nextConfig;
