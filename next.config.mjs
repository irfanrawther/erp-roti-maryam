import withPWA from 'next-pwa';

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withPWA({
  dest: 'public',
})(nextConfig);