/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pla: {
          bg: '#0f1419',
          panel: '#1a2332',
          border: '#2d3a4f',
          accent: '#6366f1',
          accentHover: '#4f46e5',
          text: '#e2e8f0',
          muted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
}
