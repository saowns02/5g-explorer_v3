/** @type {import('tailwindcss').Config} */
// Design tokens. Cool survey-sheet ground, deep blue-black ink for text and
// selected states, orange reserved for data (the globe ramp), sky for the
// current selection. One type family, Archivo, used at several widths.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#eef1ef', // page and sidebar
        panel: '#fafbfa', // floating panels, inputs
        ink: '#17212b', // text, active controls
        muted: '#5d6b77', // secondary text
        faint: '#8a96a0', // tertiary text, counts
        rule: '#d3dad8', // borders and dividers
        field: '#0f1b26', // the map table behind the globe
        signal: '#d9622b', // data accent and focus
        select: '#38bdf8', // selected hexagon / place
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
      },
    },
  },
  plugins: [],
};
