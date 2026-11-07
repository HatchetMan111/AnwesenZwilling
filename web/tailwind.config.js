/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // LichtValley-Palette: dunkles Blaugrau + Limette
        lv: {
          bg: '#10141a',
          karte: '#181e26',
          kante: '#2a323e',
          text: '#e5e7eb',
          blass: '#9ca3af',
          limette: '#b4e33d',
        },
      },
    },
  },
  plugins: [],
};
