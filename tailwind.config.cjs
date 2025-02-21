/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#1a1a1a',
          panel: '#2a2a2a',
          border: '#3a3a3a',
          editor: '#333333',
        },
      },
      width: {
        panel: '250px',
        'panel-collapsed': '5px',
        handle: '30px',
      },
      height: {
        handle: '30px',
        'handle-collapsed': '5px',
      },
      spacing: {
        'panel-padding': '1rem',
      },
      transitionProperty: {
        width: 'width',
        height: 'height',
      },
      transitionDuration: {
        300: '300ms',
      },
    },
  },
  plugins: [],
};
