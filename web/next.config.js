/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // better-sqlite3 is a native module — let it stay external instead of
    // being bundled by webpack, otherwise the .node binary doesn't load.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};
module.exports = nextConfig;
