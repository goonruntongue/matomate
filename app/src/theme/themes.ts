// Design themes. DOM tokens live in styles.css under [data-theme]; this file holds the 3D-side values.
export type ThemeId = 'midnight-blue' | 'pastel-rainbow' | 'kraft-paper';

export interface Theme3D {
  label: string;
  background: string;
  fog: string;
  glowA: string;
  glowB: string;
  gridCell: string;
  gridSection: string;
  sparkles: string;
  sparklesOpacity: number;
  /** Block body color; 'rainbow' spreads a pastel hue gradient across the field (decorative, not group-based). */
  blockColor: string | 'rainbow';
  blockOpacity: number;
  blockGlow: number;
  /** Saturation / lightness (%) of the 'rainbow' block gradient. */
  rainbowSat: number;
  rainbowLight: number;
  accent: string;
  trayColors: readonly [string, string, string, string, string];
  trayMetal: string;
  trayMetalEmissive: string;
  /** Tray material feel: 0/high roughness reads as wood, higher metalness as coated metal. */
  trayMetalness: number;
  trayRoughness: number;
  trayFloorOpacity: number;
  plateTop: string;
  plateBottom: string;
  plateText: string;
  platePlaceholder: string;
  guide: string;
  bloom: number;
  vignette: number;
  ambient: number;
  envIntensity: number;
}

export const THEMES: Record<ThemeId, Theme3D> = {
  'midnight-blue': {
    label: 'Midnight Blue',
    background: '#050C1C',
    fog: '#050C1C',
    glowA: 'rgba(18, 59, 112, 0.9)',
    glowB: 'rgba(12, 82, 96, 0.7)',
    gridCell: '#12305A',
    gridSection: '#1E5A8C',
    sparkles: '#45E5FF',
    sparklesOpacity: 0.35,
    blockColor: '#6B86CE',
    blockOpacity: 0.28,
    blockGlow: 0.1,
    rainbowSat: 80,
    rainbowLight: 70,
    accent: '#45E5FF',
    trayColors: ['#45E5FF', '#FFBF36', '#FF745E', '#B6A1FF', '#7CF0B5'],
    trayMetal: '#123472',
    trayMetalEmissive: '#061532',
    trayMetalness: 0.55,
    trayRoughness: 0.3,
    trayFloorOpacity: 0.08,
    plateTop: 'rgba(14, 36, 76, 0.92)',
    plateBottom: 'rgba(5, 14, 34, 0.92)',
    plateText: '#F3F8FF',
    platePlaceholder: 'rgba(168, 187, 213, 0.6)',
    guide: '#45E5FF',
    bloom: 1,
    vignette: 0.6,
    ambient: 0.35,
    envIntensity: 0.6,
  },
  // Eye-friendly pastel: no large pure-white areas (backdrop ≈ L*90), muted "dusty" hues,
  // saturated color only on small accents, and almost no bloom/glare.
  'pastel-rainbow': {
    label: 'Pastel Rainbow',
    background: '#E9E4F0',
    fog: '#E9E4F0',
    glowA: 'rgba(236, 196, 214, 0.45)',
    glowB: 'rgba(190, 212, 232, 0.45)',
    gridCell: '#D9D1E6',
    gridSection: '#C3B8D6',
    sparkles: '#FFF7FB',
    sparklesOpacity: 0.4,
    blockColor: 'rainbow',
    blockOpacity: 0.55,
    blockGlow: 0.08,
    rainbowSat: 52,
    rainbowLight: 74,
    accent: '#8E78CF',
    trayColors: ['#E39BB8', '#E6AE86', '#D9BD6A', '#86C2A8', '#8FA6DA'],
    trayMetal: '#D8D0E6',
    trayMetalEmissive: '#000000',
    trayMetalness: 0.35,
    trayRoughness: 0.35,
    trayFloorOpacity: 0.12,
    plateTop: 'rgba(250, 247, 252, 0.94)',
    plateBottom: 'rgba(238, 233, 245, 0.94)',
    plateText: '#3F3A52',
    platePlaceholder: 'rgba(90, 80, 120, 0.5)',
    guide: '#9A83D6',
    bloom: 0.06,
    vignette: 0.18,
    ambient: 0.5,
    envIntensity: 0.5,
  },
  // Warm, low-glare "craft studio": kraft-paper desk, wooden trays, frosted sage-glass blocks.
  // Mid-light warm backdrop (no pure white) and earthy, low-saturation hues.
  'kraft-paper': {
    label: 'Kraft Paper',
    background: '#E4D8C4',
    fog: '#E4D8C4',
    glowA: 'rgba(245, 226, 196, 0.55)',
    glowB: 'rgba(196, 214, 196, 0.35)',
    gridCell: '#D3C4AB',
    gridSection: '#BFAB8C',
    sparkles: '#FFF3DC',
    sparklesOpacity: 0.25,
    blockColor: '#9DBDB3',
    blockOpacity: 0.62,
    blockGlow: 0.06,
    rainbowSat: 40,
    rainbowLight: 70,
    accent: '#B5573A',
    trayColors: ['#C8643F', '#C9962B', '#7E8F4E', '#3E8A86', '#6A6FA8'],
    trayMetal: '#B98A5E',
    trayMetalEmissive: '#000000',
    trayMetalness: 0,
    trayRoughness: 0.72,
    trayFloorOpacity: 0.1,
    plateTop: 'rgba(250, 244, 233, 0.95)',
    plateBottom: 'rgba(238, 227, 208, 0.95)',
    plateText: '#3B3228',
    platePlaceholder: 'rgba(90, 72, 52, 0.55)',
    guide: '#B5573A',
    bloom: 0.04,
    vignette: 0.22,
    ambient: 0.55,
    envIntensity: 0.45,
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Rainbow hue for a horizontal position in [0, 1], at the theme's saturation/lightness. */
export function rainbowHex(t: number, sat: number, light: number): string {
  const hue = (330 + 300 * Math.min(1, Math.max(0, t))) % 360;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
