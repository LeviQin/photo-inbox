import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true
      }}
    >
      <Tabs.Screen name="index" options={{ title: '今日', tabBarAccessibilityLabel: '今日' }} />
      <Tabs.Screen name="photos" options={{ title: '图库', tabBarAccessibilityLabel: '图库' }} />
      <Tabs.Screen name="profile" options={{ title: '设置', tabBarAccessibilityLabel: '设置' }} />
      <Tabs.Screen name="discover" options={{ href: null }} />
    </Tabs>
  );
}
