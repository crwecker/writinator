/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  swcMinify: true,
  pageExtensions: ['jsx', 'js', 'tsx', 'ts'],
  images: {
    unoptimized: true,
    domains: ['res.cloudinary.com'],
  }
}

export default nextConfig
