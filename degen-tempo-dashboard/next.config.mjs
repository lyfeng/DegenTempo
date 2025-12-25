/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable instrumentation hook for proxy configuration
    instrumentationHook: true,
  },
};

export default nextConfig;
