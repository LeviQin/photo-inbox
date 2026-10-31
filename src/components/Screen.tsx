import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';
import { AmbientBackground } from '@/components/AmbientBackground';

export function Screen({
  children,
  scroll = true,
  contentStyle,
  maxContentWidth = 760,
  keyboard = false,
  tab = false,
  header
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle; maxContentWidth?: number; keyboard?: boolean; tab?: boolean; header?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const content = [styles.content, contentStyle, { paddingBottom: (tab ? 0 : insets.bottom) + 24, maxWidth: maxContentWidth }];
  const background = <AmbientBackground />;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={content}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : <View style={[content, styles.flex]}>{children}</View>;

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        {background}
        {header ? <View style={[styles.header, { maxWidth: maxContentWidth }]}>{header}</View> : null}
        {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{body}</KeyboardAvoidingView> : body}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {background}
      {header ? <View style={[styles.header, { maxWidth: maxContentWidth }]}>{header}</View> : null}
      {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{body}</KeyboardAvoidingView> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { width: '100%', alignSelf: 'center' },
  content: { width: '100%', alignSelf: 'center', paddingHorizontal: 20 }
});
