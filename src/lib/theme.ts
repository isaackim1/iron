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
  card: 28,
  cardLg: 36,
  cardSm: 16,
  pill: 999,
};

export const spacing = {
  screen: 24,
  gap: 12,
};

export type Lang = 'en' | 'ko';

// Font families per language. Korean text renders in Noto Sans KR
// (Istok Web / Lato have no Hangul glyphs).
export const fonts = {
  title: (l: Lang) => (l === 'ko' ? 'NotoSansKR_700Bold' : 'IstokWeb_700Bold'),
  body: (l: Lang) => (l === 'ko' ? 'NotoSansKR_400Regular' : 'IstokWeb_400Regular'),
  quote: (l: Lang) =>
    l === 'ko' ? 'NotoSansKR_400Regular' : 'IstokWeb_400Regular_Italic',
  quoteBold: (l: Lang) =>
    l === 'ko' ? 'NotoSansKR_700Bold' : 'IstokWeb_700Bold_Italic',
  button: (l: Lang) => (l === 'ko' ? 'NotoSansKR_700Bold' : 'Lato_700Bold'),
};
