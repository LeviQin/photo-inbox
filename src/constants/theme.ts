import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  fillSecondary: '#E9E9EF',
  text: '#111111',
  muted: '#6E6E73',
  tertiary: '#8E8E93',
  border: 'rgba(60, 60, 67, 0.18)',
  primary: '#5856D6',
  primarySoft: '#EFEEFF',
  success: '#248A3D',
  warning: '#B25000',
  danger: '#D70015',
  overlay: 'rgba(0, 0, 0, 0.38)',
  dark: '#1C1C1E'
} as const;

export const darkColors = {
  background: '#000000',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  fillSecondary: '#2C2C2E',
  text: '#F5F5F7',
  muted: '#AEAEB2',
  tertiary: '#8E8E93',
  border: 'rgba(84, 84, 88, 0.65)',
  primary: '#5E5CE6',
  primarySoft: '#2A2748',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  overlay: 'rgba(0, 0, 0, 0.52)',
  dark: '#2C2C2E'
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
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const }
} as const;
