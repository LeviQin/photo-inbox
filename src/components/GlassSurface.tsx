import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/constants/theme';

export function GlassSurface({ children, style, intensity = 32 }: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}>) {
  const theme = useAppTheme();
  return <View style={[styles.surface, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 }
});
