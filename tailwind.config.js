/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        saffron: {
          50: '#fff8ed',
          100: '#ffefd4',
          200: '#ffdba8',
          300: '#ffc170',
          400: '#ff9c37',
          500: '#ff7f10',
          600: '#f06306',
          700: '#c74a07',
          800: '#9e3a0e',
          900: '#7f320f',
        },
        ink: {
          950: '#0f0d0a',
          900: '#1a1612',
          800: '#2a241e',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 120s linear infinite',
        'spin-slow-reverse': 'spin 90s linear infinite reverse',
      },
    },
  },
  plugins: [],
};
