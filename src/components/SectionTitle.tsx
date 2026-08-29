import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, typography } from '@/constants/theme';

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={styles.actionButton}>
          <Text style={[styles.action, { color: theme.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
  title: { ...typography.title2 },
  actionButton: { minHeight: 44, justifyContent: 'center' },
  action: { ...typography.footnote, fontWeight: '600' }
});
