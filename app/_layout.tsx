import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { useAppStore } from '@/store/useAppStore';
import { AppState, Platform, useColorScheme } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useAppTheme } from '@/constants/theme';
import { watchPhotoLibrary } from '@/services/photoLibrarySync';

export default function RootLayout() {
  const initialize = useAppStore((state) => state.initialize);
  const initialized = useAppStore((state) => state.initialized);
  const scan = useAppStore((state) => state.scan);
  const resumeAnalysis = useAppStore((state) => state.resumeAnalysis);
  const scheme = useColorScheme();
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    if (initialized) return watchPhotoLibrary((changes) => scan({ passive: true, changes }));
  }, [initialized, scan]);
  useEffect(() => {
    if (Platform.OS === 'android') NavigationBar.setStyle(scheme === 'dark' ? 'dark' : 'light');
  }, [scheme]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.background).catch(() => undefined);
  }, [theme.background]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void resumeAnalysis().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [resumeAnalysis]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'slide_from_right', contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="photo/[id]" />
        <Stack.Screen name="review/index" />
        <Stack.Screen name="cleanup" />
        <Stack.Screen name="analysis" />
        <Stack.Screen name="similar" />
        <Stack.Screen name="search" />
        <Stack.Screen name="trash" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/ai" />
        <Stack.Screen name="privacy" />
      </Stack>
    </>
  );
}
