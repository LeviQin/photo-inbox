import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';
import { GlassSurface } from '@/components/GlassSurface';

export function BottomActionBar({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  return (
    <GlassSurface intensity={38} style={[styles.bar, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border }]}>
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 }
});
