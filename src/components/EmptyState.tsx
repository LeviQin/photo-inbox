import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme, typography } from '@/constants/theme';
import { GeneratedIcon } from '@/components/GeneratedIcon';

export function EmptyState({ icon = 'images-outline', title, description }: {
  icon?: string;
  title: string;
  description: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.wrap}>
      <GeneratedIcon name={icon} size={40} style={styles.icon} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.desc, { color: theme.muted }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 30 },
  icon: { marginBottom: 14 },
  title: { ...typography.headline, marginBottom: 7 },
  desc: { ...typography.subheadline, textAlign: 'center' }
});
