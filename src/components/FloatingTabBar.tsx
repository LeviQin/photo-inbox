import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UtilityIcon, type UtilityIconName } from '@/components/UtilityIcon';
import { useAppTheme } from '@/constants/theme';

const iconMap: Record<string, UtilityIconName> = {
  index: 'calendar',
  photos: 'gallery',
  profile: 'sliders'
};

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((route) => route.name !== 'discover');

  return (
    <View style={[styles.host, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.background }]}>
      <View style={[styles.bar, { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder, shadowColor: theme.glassShadow }]}>
      {routes.map((route) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const focused = state.routes[state.index]?.key === route.key;
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : typeof options.title === 'string' ? options.title : route.name;
        const color = focused ? theme.primary : theme.muted;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            accessibilityState={focused ? { selected: true } : {}}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={({ pressed }) => [styles.item, focused && { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <UtilityIcon name={iconMap[route.name] ?? 'gallery'} size={22} color={color} strokeWidth={focused ? 2.1 : 1.8} active={focused} />
            </View>
            <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { width: '100%', paddingHorizontal: 20, paddingTop: 8, backgroundColor: 'transparent' },
  bar: { width: '100%', maxWidth: 420, height: 66, alignSelf: 'center', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 18, elevation: 9 },
  item: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 999 },
  iconWrap: { width: 52, height: 29, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 }
});
