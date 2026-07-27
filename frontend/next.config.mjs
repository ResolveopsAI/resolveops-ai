const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://api-gateway-service:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
