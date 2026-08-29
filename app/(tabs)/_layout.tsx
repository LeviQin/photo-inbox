import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';

const iconMap = {
  index: ['today', 'today-outline'],
  photos: ['images', 'images-outline'],
  discover: ['sparkles', 'sparkles-outline'],
  profile: ['settings', 'settings-outline']
} as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tertiary,
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          backgroundColor: theme.elevated,
          borderTopColor: theme.border
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const names = iconMap[route.name as keyof typeof iconMap] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? names[0] : names[1]} size={size ?? 22} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="index" options={{ title: '今日', tabBarAccessibilityLabel: '今日' }} />
      <Tabs.Screen name="photos" options={{ title: '图库', tabBarAccessibilityLabel: '图库' }} />
      <Tabs.Screen name="discover" options={{ title: '发现' }} />
      <Tabs.Screen name="profile" options={{ title: '设置', tabBarAccessibilityLabel: '设置' }} />
    </Tabs>
  );
}
