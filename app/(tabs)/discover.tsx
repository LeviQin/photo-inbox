import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

const prompts = ['去年的截图', '最近的美食照片', '我的宠物照片', '人物自拍'];

export default function DiscoverScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const photos = useAppStore((state) => state.photos).filter((photo) => photo.status !== 'trashed');
  const categories = [
    ['旅行', 'airplane-outline', 'travel'], ['截图', 'phone-portrait-outline', 'screenshot'],
    ['美食', 'restaurant-outline', 'food'], ['宠物', 'paw-outline', 'pet']
  ] as const;
  const available = categories.filter(([, , key]) => photos.some((photo) => photo.category === key));

  return (
    <Screen>
      <TopBar title="发现" subtitle="用搜索重新找到你的照片" />
      <Pressable accessibilityRole="search" accessibilityLabel="搜索照片" style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push('/search')}>
        <Ionicons name="search" size={18} color={theme.primary} />
        <Text style={[styles.searchText, { color: theme.muted }]}>搜索照片、时间或分类</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.tertiary} />
      </Pressable>

      {available.length ? <>
        <SectionTitle title="智能分类" />
        <View style={styles.grid}>{available.map(([label, icon, key]) => <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${photos.filter((photo) => photo.category === key).length} 张`} key={key} style={[styles.categoryRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]} onPress={() => router.push(`/photos?category=${key}`)}>
          <View style={[styles.categoryIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} size={21} color={theme.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.categoryTitle, { color: theme.text }]}>{label}</Text><Text style={[styles.categoryCount, { color: theme.muted }]}>{photos.filter((photo) => photo.category === key).length} 张</Text></View>
          <Ionicons name="chevron-forward" size={18} color={theme.tertiary} />
        </Pressable>)}</View>
      </> : <EmptyState icon="search-outline" title="等待照片进入发现" description="扫描相册后，有内容的分类和搜索建议会出现在这里。" />}

      <SectionTitle title="搜索建议" />
      <View style={styles.promptList}>{prompts.map((prompt) => <Pressable accessibilityRole="button" accessibilityLabel={`搜索${prompt}`} key={prompt} style={[styles.prompt, { borderBottomColor: theme.border }]} onPress={() => router.push({ pathname: '/search', params: { q: prompt } })}><Text style={[styles.promptText, { color: theme.text }]}>{prompt}</Text><Ionicons name="arrow-up-outline" size={16} color={theme.tertiary} /></Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { minHeight: 56, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  searchText: { flex: 1, ...typography.subheadline },
  grid: { borderRadius: 14, overflow: 'hidden' },
  categoryRow: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { ...typography.callout },
  categoryCount: { ...typography.footnote, marginTop: 2 },
  promptList: { borderRadius: 14, overflow: 'hidden' },
  prompt: { minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  promptText: { ...typography.subheadline }
});
