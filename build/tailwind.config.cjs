/** Tailwind config for the FinTracker production build.
 *  Mirrors the runtime CDN config (darkMode class + Noto Sans Thai).
 *  `content` scans the inline JSX in index.html so every className literal
 *  used in the app is emitted into the static stylesheet. */
module.exports = {
  content: ['./fintracker/index.html', './fintracker/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: {
    fontFamily: { sans: ['Noto Sans Thai', 'sans-serif'] },
    // Bright antique-gold accent (Wall Street terminal). Kept genuinely bright so
    // fills pop against the near-black bg instead of blending in. Solid gold fills
    // (bg-gold-500/600/700) get dark ink via a CSS rule in index.html, so they read
    // like classic gold buttons; 300/400 are the bright gold used for text/borders
    // on dark surfaces.
    // Gain and loss, redefined at the source. Tailwind's own emerald-400
    // (#34d399) and rose-400 (#fb7185) are cool and heavily saturated, so
    // against a warm near-black they sat in front of the page instead of on it
    // — every percentage figure shouting louder than the number it belonged to.
    //
    // The replacements are not new inventions: the budget page was already
    // using #7aab8a and #c9726a and never looked wrong, so those become the
    // standard and the loud pair comes down to meet them. Overriding the scale
    // here rather than at the ~345 call sites means every shade and every
    // opacity modifier regenerates together, and the budget page is unchanged
    // by construction.
    //
    // The class names stay `emerald` and `rose`. Renaming them to sage and
    // terracotta would have been more honest and would also have meant editing
    // all 345 sites to gain nothing a comment cannot say.
    colors: {
      // The action colour. Gold says what the app is made of; orange says where
      // to press. Splitting them settles an argument the interface could not
      // otherwise win: with one colour doing both, "this is the brand" and
      // "this is the live control" looked identical, and every gold border made
      // the gold buttons quieter. Orange is used sparingly and at full strength
      // — buttons, the active tab, one word in a page heading — which is what
      // gives a single accent its force.
      orange: {
        50:  '#fdf3ee',
        100: '#fae1d4',
        200: '#f4c1a6',
        300: '#ee9d74',
        400: '#e8763a',
        500: '#d8602a',
        600: '#b44c20',
        700: '#8f3d1b',
        800: '#733219',
        900: '#5e2b18',
        950: '#33140a',
      },
      // Neutral, with a trace of warmth and no more than that. Fixing the
      // blue-grey overshot the first time: at chroma 12-14 these stopped being
      // greys and became taupe, and a gold surrounded by warm brown has nothing
      // left to be gold against. The whole interface read as brown, and the
      // accent was blamed for it. Gold is a relationship, not a hex value.
      //
      // Chroma 3-6 keeps them on the warm side of neutral while leaving the
      // accent the only saturated thing on screen, which is what makes metal
      // look like metal: black-and-gold work has a neutral charcoal ground and
      // spends every bit of its saturation on the gold.
      slate: {
        50:  '#f7f6f5',
        100: '#eae9e7',
        200: '#d5d3d0',
        300: '#b3b1ad',
        400: '#8b8985',
        500: '#6f6d6a',
        600: '#585654',
        700: '#454341',
        800: '#302f2d',
        900: '#1d1c1b',
        950: '#111110',
      },
      emerald: {
        50:  '#f0f5f2',
        100: '#dceae1',
        200: '#bcd5c6',
        300: '#9bc0aa',
        400: '#7aab8a',
        500: '#5f9070',
        600: '#4b735a',
        700: '#3d5c49',
        800: '#324a3c',
        900: '#2a3d32',
        950: '#15201a',
      },
      // Dividends. Tailwind's teal-400 (#2dd4bf) is a near-fluorescent cyan and
      // was the loudest thing left on the screen once gain and loss came down.
      // Kept as its own colour rather than folded into the gain sage, because
      // the distinction earns its place in the transaction list, where dividend
      // rows sit among ordinary income and expense — just quiet enough now to
      // read as a relative of the sage rather than a different design.
      teal: {
        50:  '#eff5f3',
        100: '#dbe9e4',
        200: '#b9d3ca',
        300: '#94bab0',
        400: '#6fa08f',
        500: '#578576',
        600: '#456b5f',
        700: '#39564d',
        800: '#304641',
        900: '#293a36',
        950: '#141f1c',
      },
      rose: {
        50:  '#fdf0ee',
        100: '#f9dcd8',
        200: '#f0bcb4',
        300: '#dd9790',
        400: '#c9726a',
        500: '#ad5a53',
        600: '#8f4842',
        700: '#743b36',
        800: '#5f322e',
        900: '#4f2b28',
        950: '#2a1513',
      },
      gold: {
        50:  '#fdf9ec',
        100: '#f8eec5',
        200: '#f0dc93',
        300: '#e6c85c',
        400: '#d9af2b',
        500: '#c39a17',
        600: '#9a7810',
        700: '#7a5f11',
        800: '#644e14',
        900: '#40320d',
        950: '#251c06',
      },
    },
  } },
};
