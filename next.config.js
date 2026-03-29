/** @type {import('next').NextConfig} */
module.exports = {
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  images: {
    unoptimized: true
  }
};
