// Iron design tokens — sourced from the Figma prototype
// (pale neutral bg, yellow accent, dark rounded cards, calm + warm)

export const colors = {
  bg: '#F3F3F5',
  card: '#FFFFFF',
  cardDark: '#2C2C2A',
  input: '#EBEBEB',
  yellow: '#FFCF00', // bright accent (labels, highlights, selected)
  yellowSoft: '#F8D64E', // button yellow
  ink: '#1D1D1B',
  charcoal: '#474747',
  muted: '#888880',
  mutedOnDark: '#9E9C94',
  onDark: '#F3F3F5',
  hairline: '#E3E3E0',
  danger: '#B4534B',
};

export const radii = {
  card: 28, // Surface/Primary + dark prayer card
  cardLg: 36, // expanded prayer card
  cardSm: 16, // group card, setting rows, multiline inputs
  pill: 999, // buttons + single-line inputs
};

export const spacing = {
  screen: 24,
  gap: 12,
};

// Component geometry from the Iron — Final Brand System (06 · Product Components).
// Buttons keep one shape and two paddings (17/32, 9/22) — heights fall out of
// those + line-height, matching the Figma frames (CTA 53, small pill 44).
export const sizes = {
  cta: 53, // primary CTA / input frame height in Figma
  touchTarget: 48, // minimum interactive area (a11y)
};

export type Lang = 'en' | 'ko';

// Three bilingual voices, per Iron — Final Brand System (04 · Typography):
//   • English voice     → Istok Web (titles, body, Scripture italic)
//   • Korean voice       → Noto Sans KR (everything Korean, always upright —
//                          Korean is never italicized or mechanically skewed)
//   • Numeric/CTA voice   → Lato (English button labels + every *standalone*
//                          numeral the product shows — codes, OTP, times — in
//                          both languages). Numerals inside a running text line
//                          inherit that line's font (no mid-line switch).
// Korean has no italic member on purpose; the Scripture italic maps to an
// upright Korean equivalent (weight / quotation marks), not fake-oblique.
export const fonts = {
  title: (l: Lang) => (l === 'ko' ? 'NotoSansKR_700Bold' : 'IstokWeb_700Bold'),
  body: (l: Lang) => (l === 'ko' ? 'NotoSansKR_400Regular' : 'IstokWeb_400Regular'),
  quote: (l: Lang) =>
    l === 'ko' ? 'NotoSansKR_400Regular' : 'IstokWeb_400Regular_Italic',
  quoteBold: (l: Lang) =>
    l === 'ko' ? 'NotoSansKR_700Bold' : 'IstokWeb_700Bold_Italic',
  button: (l: Lang) => (l === 'ko' ? 'NotoSansKR_700Bold' : 'Lato_700Bold'),
  // Language-neutral numeric voice — one look for codes/OTP/times across EN + KO.
  numeric: (_l: Lang) => 'Lato_700Bold',
};
