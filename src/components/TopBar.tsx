import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme, typography } from '@/constants/theme';
import { GeneratedIcon } from '@/components/GeneratedIcon';

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
            <GeneratedIcon name="back" size={24} />
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
  wrap: { paddingTop: 4, paddingBottom: 12, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  titleWrap: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.55 },
  subtitle: { marginTop: 2, ...typography.footnote }
});
