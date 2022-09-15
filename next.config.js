/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  pageExtensions: ['jsx', 'js', 'tsx', 'ts'],
  images: {
    domains: ['res.cloudinary.com'],
  },
}
module.exports = nextConfig
