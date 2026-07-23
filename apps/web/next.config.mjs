/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the workspace TypeScript packages directly.
  transpilePackages: ['@ironflow/ui', '@ironflow/core', '@ironflow/api-client'],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Resolve the packages' `.js` ESM specifiers to their `.ts` sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
