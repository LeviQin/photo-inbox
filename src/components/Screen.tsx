import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/constants/theme';

export function Screen({
  children,
  scroll = true,
  contentStyle,
  maxContentWidth = 760,
  keyboard = false
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle; maxContentWidth?: number; keyboard?: boolean }>) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const content = [styles.content, contentStyle, { paddingBottom: insets.bottom + 24, maxWidth: maxContentWidth }];
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
        {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{body}</KeyboardAvoidingView> : body}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{body}</KeyboardAvoidingView> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { width: '100%', alignSelf: 'center', paddingHorizontal: 20 }
});
