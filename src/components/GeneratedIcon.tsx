import { type ColorValue, type StyleProp, type ViewStyle, View } from 'react-native';
import { resolveUtilityIconName, UtilityIcon } from '@/components/UtilityIcon';
import { useAppTheme } from '@/constants/theme';

export function GeneratedIcon({ name, size = 22, color, opacity = 1, style }: {
  name: string;
  size?: number;
  color?: ColorValue;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  return <View style={[{ opacity }, style]}><UtilityIcon name={resolveUtilityIconName(name) ?? 'gallery'} size={size} color={color ?? theme.muted} /></View>;
}

export const Ionicons = Object.assign(GeneratedIcon, { glyphMap: {} as Record<string, number> });
