import { StyleSheet } from 'react-native';
import { View } from 'react-native';
import { useAppTheme } from '@/constants/theme';

export function AmbientBackground() {
  const theme = useAppTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }, styles.background]} />;
}

const styles = StyleSheet.create({ background: { pointerEvents: 'none' } });
