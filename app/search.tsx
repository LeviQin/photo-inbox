import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@/components/GeneratedIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { EmptyState } from '@/components/EmptyState';
import { GlassSurface } from '@/components/GlassSurface';
import { AmbientBackground } from '@/components/AmbientBackground';
import { useAppTheme, typography } from '@/constants/theme';
import { getAppSettings } from '@/db/database';
import { usePaginatedPhotos } from '@/hooks/usePaginatedPhotos';
import { getAIConfig } from '@/services/aiConfig';
import { expandSearchWithAI } from '@/services/aiFeatures';
import { formatDate } from '@/utils/format';

const suggestions = ['截图', '最近 30 天', '大文件', '今年', '去年', '旅行'];

export default function SearchScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const queryParam = typeof params.q === 'string' ? params.q : '';
  const [query, setQuery] = useState(queryParam);
  const [debouncedQuery, setDebouncedQuery] = useState(queryParam);
  const queryRef = useRef(queryParam);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [aiTerms, setAiTerms] = useState<string[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  useEffect(() => { queryRef.current = queryParam; setQuery(queryParam); setAiTerms(null); setAiMessage(''); }, [queryParam]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => { void getAppSettings().then((settings) => setSearchEnabled(settings.searchIndex)); }, []);
  const { items: results, loading, loadingMore, hasMore, error, refresh, loadMore } = usePaginatedPhotos({ status: 'available', query: searchEnabled ? debouncedQuery : '', queryTerms: searchEnabled ? aiTerms : null });
  const showingResults = searchEnabled && Boolean(debouncedQuery);
  const searching = loading || aiLoading || query.trim() !== debouncedQuery;
  const runAIExpansion = async () => {
    if (!query.trim() || aiLoading) return;
    const submittedQuery = query.trim();
    try {
      const config = await getAIConfig();
      if (!config.apiKey.trim()) {
        Alert.alert('先配置 AI 服务', 'AI 搜索只会发送你输入的文字，不会发送照片。', [
          { text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => router.push('/settings/ai') }
        ]);
        return;
      }
      Alert.alert('扩展这条搜索？', `只会把“${submittedQuery}”发送到你配置的 AI 服务，用来匹配本地索引；不会发送照片。`, [
        { text: '取消', style: 'cancel' },
        { text: '继续', onPress: () => {
          setAiLoading(true);
          setAiMessage('');
          void expandSearchWithAI(config, submittedQuery).then((terms) => {
            if (queryRef.current.trim() !== submittedQuery) return;
            setAiTerms(terms);
            setAiMessage(`AI 关键词：${terms.join(' · ')}`);
          }).catch((error) => {
            if (queryRef.current.trim() !== submittedQuery) return;
            setAiTerms(null);
            setAiMessage(error instanceof Error ? error.message : 'AI 搜索失败，请重试。');
          }).finally(() => setAiLoading(false));
        } }
      ]);
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : '读取 AI 配置失败');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <AmbientBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" style={styles.iconButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable>
          <GlassSurface intensity={30} style={[styles.inputWrap, { borderColor: theme.border }]}>
            <Ionicons name="search" size={23} color={theme.muted} />
            <TextInput accessibilityLabel="搜索照片" value={query} onChangeText={(value) => { queryRef.current = value; setQuery(value); setAiTerms(null); setAiMessage(''); }} autoFocus placeholder="搜索文件名、分类或已识别文字…" placeholderTextColor={theme.tertiary} style={[styles.input, { color: theme.text }]} returnKeyType="search" />
            {query ? <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" style={styles.clearButton} onPress={() => { setQuery(''); setAiTerms(null); setAiMessage(''); }}><Ionicons name="close-circle" size={24} color={theme.tertiary} /></Pressable> : null}
          </GlassSurface>
        </View>

        {query.trim() && searchEnabled ? <View style={styles.aiRow}>
          <Pressable accessibilityRole="button" disabled={aiLoading || Platform.OS === 'web'} onPress={() => void runAIExpansion()} style={[styles.aiButton, { backgroundColor: theme.primarySoft }, (aiLoading || Platform.OS === 'web') && styles.disabled]}><Ionicons name="sparkles" size={17} color={theme.primary} /><Text style={[styles.aiButtonText, { color: theme.primary }]}>{aiLoading ? 'AI 正在理解…' : aiTerms ? '重新扩展' : 'AI 理解搜索'}</Text></Pressable>
          {aiMessage ? <Text style={[styles.aiMessage, { color: aiTerms ? theme.muted : theme.danger }]}>{aiMessage}</Text> : null}
        </View> : null}

        {!query.trim() ? <ScrollView contentContainerStyle={styles.emptySearch} keyboardShouldPersistTaps="handled"><Text style={[styles.title, { color: theme.text }]}>搜索你的照片</Text><Text style={[styles.desc, { color: theme.muted }]}>{searchEnabled ? '可搜文件名、分类、年份、图片文字，以及已保存的 AI 画面描述；也能按最近时间和大文件筛选。' : '搜索索引已关闭，可以在设置中重新开启。'}</Text>{searchEnabled ? <><Text style={[styles.quickLabel, { color: theme.muted }]}>快捷筛选</Text><View style={styles.suggestions}>{suggestions.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`搜索${item}`} key={item} onPress={() => setQuery(item)}><GlassSurface intensity={24} style={[styles.suggestion, { borderColor: theme.border }]}><Text style={[styles.suggestionText, { color: theme.text }]}>{item}</Text></GlassSurface></Pressable>)}</View></> : null}</ScrollView> : (
          <View style={styles.results}><Text style={[styles.resultCount, { color: theme.muted }]}>{!searchEnabled ? '搜索索引已关闭' : searching ? '正在搜索…' : error ? '搜索失败' : `${hasMore ? '已加载' : '找到'} ${showingResults ? results.length : 0} 张`}</Text><View style={styles.grid}>{!searchEnabled ? <EmptyState icon="search-outline" title="搜索索引已关闭" description="在设置中开启后即可搜索照片。" /> : error && !searching ? <><EmptyState icon="alert-circle-outline" title="搜索失败" description={error} /><Pressable accessibilityRole="button" style={styles.clearAction} onPress={() => void refresh()}><Text style={[styles.clearActionText, { color: theme.primary }]}>重试</Text></Pressable></> : showingResults && !searching && results.length ? <FlashList data={results} keyExtractor={(item) => item.id} contentContainerStyle={styles.resultList} onEndReached={loadMore} onEndReachedThreshold={0.65} ListFooterComponent={loadingMore ? <Text style={[styles.resultCount, { color: theme.muted }]}>加载更多…</Text> : null} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`打开 ${item.filename}，匹配${item.searchHit?.label ?? '搜索条件'}`} onPress={() => router.push(`/photo/${item.id}`)} style={[styles.resultRow, { borderBottomColor: theme.border }]}><Image source={{ uri: item.uri }} style={styles.thumbnail} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} /><View style={styles.resultBody}><Text numberOfLines={1} style={[styles.resultTitle, { color: theme.text }]}>{item.filename}</Text><Text numberOfLines={2} style={[styles.resultSnippet, { color: theme.muted }]}>{item.searchHit?.label ?? '匹配搜索条件'}{item.searchHit?.snippet ? ` · ${item.searchHit.snippet}` : ''}</Text><Text style={[styles.resultDate, { color: theme.tertiary }]}>{formatDate(item.createdAt)}</Text></View><Ionicons name="chevron-forward" size={18} color={theme.tertiary} /></Pressable>} /> : !searching ? <><EmptyState icon="search-outline" title="没有找到匹配照片" description="可试文件名、分类、图片文字或已保存的 AI 描述；尚未识别的画面内容不会自动上传分析。" /><Pressable accessibilityRole="button" accessibilityLabel="清除搜索条件" style={styles.clearAction} onPress={() => setQuery('')}><Text style={[styles.clearActionText, { color: theme.primary }]}>清除搜索条件</Text></Pressable></> : null}</View></View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiRow: { minHeight: 48, paddingHorizontal: 20, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  aiButtonText: { ...typography.caption, fontWeight: '700' }, aiMessage: { flex: 1, ...typography.caption }, disabled: { opacity: 0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, ...typography.subheadline, paddingVertical: 0 }, clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptySearch: { padding: 24 }, title: { ...typography.title2, marginTop: 20 }, desc: { ...typography.subheadline, marginTop: 9 }, quickLabel: { ...typography.caption, marginTop: 24, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 20 }, suggestion: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth }, suggestionText: { ...typography.footnote, fontWeight: '600' },
  results: { flex: 1 }, resultCount: { paddingHorizontal: 20, paddingVertical: 12, ...typography.footnote }, grid: { flex: 1 }, resultList: { paddingHorizontal: 16, paddingBottom: 24 }, resultRow: { minHeight: 88, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, thumbnail: { width: 72, height: 72, borderRadius: 10 }, resultBody: { flex: 1, gap: 3 }, resultTitle: { ...typography.subheadline, fontWeight: '600' }, resultSnippet: { ...typography.footnote }, resultDate: { ...typography.caption }, clearAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, clearActionText: { ...typography.footnote, fontWeight: '600' }
});
