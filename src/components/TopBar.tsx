import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme, typography } from '@/constants/theme';

export function TopBar({ title, subtitle, back = false, right }: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  const theme = useAppTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
        ) : null}
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: theme.muted }]}>{subtitle}</Text> : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6, paddingBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  titleWrap: { flex: 1 },
  title: { ...typography.largeTitle, letterSpacing: -0.6 },
  subtitle: { marginTop: 4, ...typography.footnote }
});
