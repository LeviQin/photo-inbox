import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, typography } from '@/constants/theme';

export function EmptyState({ icon = 'images-outline', title, description }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} size={28} color={theme.primary} /></View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.desc, { color: theme.muted }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 30 },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { ...typography.headline, marginBottom: 7 },
  desc: { ...typography.subheadline, textAlign: 'center' }
});
