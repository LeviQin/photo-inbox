import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F6F3ED',
  backgroundTop: '#F6F3ED',
  backgroundBottom: '#F6F3ED',
  surface: '#FFFEFC',
  elevated: '#FFFFFF',
  fillSecondary: '#ECE8E0',
  text: '#292723',
  muted: '#77736C',
  tertiary: '#99948B',
  border: 'rgba(52, 46, 38, 0.11)',
  primary: '#B94E31',
  primarySoft: '#F8E9E2',
  success: '#34835A',
  warning: '#A5672F',
  danger: '#D70015',
  overlay: 'rgba(0, 0, 0, 0.38)',
  dark: '#292723',
  glass: 'rgba(255, 255, 255, 0.78)',
  glassStrong: 'rgba(255, 255, 255, 0.92)',
  glassBorder: 'rgba(52, 46, 38, 0.12)',
  glassShadow: 'rgba(62, 47, 35, 0.14)',
  isDark: false
} as const;

export const darkColors = {
  background: '#08080B',
  backgroundTop: '#08080B',
  backgroundBottom: '#08080B',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  fillSecondary: '#2C2C2E',
  text: '#F5F5F7',
  muted: '#AEAEB2',
  tertiary: '#8E8E93',
  border: 'rgba(108, 108, 116, 0.42)',
  primary: '#FF8A68',
  primarySoft: '#3A251F',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  overlay: 'rgba(0, 0, 0, 0.52)',
  dark: '#2C2C2E',
  glass: 'rgba(28, 28, 30, 0.82)',
  glassStrong: 'rgba(44, 44, 46, 0.94)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassShadow: 'rgba(0, 0, 0, 0.48)',
  isDark: true
} as const;

export type AppColors = typeof lightColors;

export function useAppTheme(): AppColors {
  return (useColorScheme() === 'dark' ? darkColors : lightColors) as AppColors;
}

// Kept for non-rendering helpers and incremental migration of old styles.
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 999
} as const;

export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title2: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const }
} as const;
