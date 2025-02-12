/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  pageExtensions: ['jsx', 'js', 'tsx', 'ts'],
  images: {
    domains: ['res.cloudinary.com'],
  },
  assetPrefix: process.env.NODE_ENV === 'production' ? '/writinator' : '/',
  basePath: process.env.NODE_ENV === 'production' ? '/writinator' : '',
}

export default nextConfig
