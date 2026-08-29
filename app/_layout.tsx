import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/useAppStore';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const initialize = useAppStore((state) => state.initialize);
  const scheme = useColorScheme();
  useEffect(() => { void initialize(); }, [initialize]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="photo/[id]" />
        <Stack.Screen name="review/index" />
        <Stack.Screen name="cleanup" />
        <Stack.Screen name="similar" />
        <Stack.Screen name="search" />
        <Stack.Screen name="trash" />
        <Stack.Screen name="settings/index" />
      </Stack>
    </>
  );
}
