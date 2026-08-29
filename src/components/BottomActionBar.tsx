import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';

export function BottomActionBar({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: theme.elevated, borderTopColor: theme.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 }
});
