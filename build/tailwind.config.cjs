/** Tailwind config for the FinTracker production build.
 *  Mirrors the runtime CDN config (darkMode class + Chakra Petch sans).
 *  `content` scans the inline JSX in index.html so every className literal
 *  used in the app is emitted into the static stylesheet. */
module.exports = {
  content: ['./fintracker/index.html', './fintracker/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: {
    fontFamily: { sans: ['Chakra Petch', 'sans-serif'] },
    // Bright antique-gold accent (Wall Street terminal). Kept genuinely bright so
    // fills pop against the near-black bg instead of blending in. Solid gold fills
    // (bg-gold-500/600/700) get dark ink via a CSS rule in index.html, so they read
    // like classic gold buttons; 300/400 are the bright gold used for text/borders
    // on dark surfaces.
    colors: {
      gold: {
        50:  '#fbf8ee',
        100: '#f5ecce',
        200: '#eddaa0',
        300: '#e1c46f',
        400: '#d4af45',
        500: '#c49e30',
        600: '#8a6a1a',
        700: '#6d5718',
        800: '#5e4a19',
        900: '#3c2f12',
        950: '#241c0a',
      },
    },
  } },
};
