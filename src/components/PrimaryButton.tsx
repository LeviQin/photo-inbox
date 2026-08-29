import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme, typography } from '@/constants/theme';

export function PrimaryButton({ label, onPress, loading = false, secondary = false }: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  secondary?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={loading} style={({ pressed }) => [
      styles.button,
      { backgroundColor: secondary ? theme.primarySoft : theme.primary },
      pressed && { opacity: 0.82 }
    ]}>
      {loading ? <ActivityIndicator color={secondary ? theme.primary : '#fff'} /> : (
        <Text style={[styles.label, { color: secondary ? theme.primary : '#fff' }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.callout }
});
