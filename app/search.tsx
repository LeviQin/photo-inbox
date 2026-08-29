import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoGrid } from '@/components/PhotoGrid';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme, typography } from '@/constants/theme';
import { getAppSettings } from '@/db/database';
import { localSemanticSearch } from '@/services/searchService';
import { useAppStore } from '@/store/useAppStore';

const suggestions = ['截图', '去年 截图', '美食', '宠物', '人物 自拍', '旅行'];

export default function SearchScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const queryParam = typeof params.q === 'string' ? params.q : '';
  const [query, setQuery] = useState(queryParam);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const photos = useAppStore((state) => state.photos).filter((photo) => photo.status !== 'trashed');
  useEffect(() => { setQuery(queryParam); }, [queryParam]);
  useEffect(() => { void getAppSettings().then((settings) => setSearchEnabled(settings.searchIndex)); }, []);
  const results = useMemo(() => searchEnabled && query.trim() ? localSemanticSearch(photos, query) : [], [photos, query, searchEnabled]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" style={styles.iconButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable>
          <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="search" size={17} color={theme.muted} />
            <TextInput accessibilityLabel="搜索照片" value={query} onChangeText={setQuery} autoFocus placeholder="搜索：截图、去年、美食…" placeholderTextColor={theme.tertiary} style={[styles.input, { color: theme.text }]} returnKeyType="search" />
            {query ? <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" style={styles.clearButton} onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={theme.tertiary} /></Pressable> : null}
          </View>
        </View>

        {!query.trim() ? <ScrollView contentContainerStyle={styles.emptySearch} keyboardShouldPersistTaps="handled"><Text style={[styles.title, { color: theme.text }]}>搜索你的照片</Text><Text style={[styles.desc, { color: theme.muted }]}>{searchEnabled ? '可按时间词和本地分类标签搜索。' : '搜索索引已关闭，可以在设置中重新开启。'}</Text><View style={styles.suggestions}>{suggestions.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`搜索${item}`} key={item} style={[styles.suggestion, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setQuery(item)}><Text style={[styles.suggestionText, { color: theme.text }]}>{item}</Text></Pressable>)}</View></ScrollView> : (
          <View style={styles.results}><Text style={[styles.resultCount, { color: theme.muted }]}>找到 {results.length} 张</Text><View style={styles.grid}>{results.length ? <PhotoGrid photos={results} /> : <><EmptyState icon="search-outline" title="没有找到匹配照片" description="可以尝试其他分类或时间关键词。" /><Pressable accessibilityRole="button" accessibilityLabel="清除搜索条件" style={styles.clearAction} onPress={() => setQuery('')}><Text style={[styles.clearActionText, { color: theme.primary }]}>清除搜索条件</Text></Pressable></>}</View></View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, ...typography.subheadline, paddingVertical: 0 }, clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptySearch: { padding: 24 }, title: { ...typography.title2, marginTop: 20 }, desc: { ...typography.subheadline, marginTop: 9 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 }, suggestion: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth }, suggestionText: { ...typography.footnote, fontWeight: '600' },
  results: { flex: 1 }, resultCount: { paddingHorizontal: 20, paddingVertical: 12, ...typography.footnote }, grid: { flex: 1 }, clearAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, clearActionText: { ...typography.footnote, fontWeight: '600' }
});
