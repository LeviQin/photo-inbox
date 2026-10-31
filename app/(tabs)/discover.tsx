import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@/components/GeneratedIcon';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { EmptyState } from '@/components/EmptyState';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

export default function DiscoverScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const stats = useAppStore((state) => state.stats);
  const categoryCounts = stats.categoryCounts;
  const categories = [
    ['旅行', 'airplane-outline', 'travel'], ['截图', 'phone-portrait-outline', 'screenshot'],
    ['美食', 'restaurant-outline', 'food'], ['宠物', 'paw-outline', 'pet'],
    ['文档', 'document-text-outline', 'document'], ['人物', 'person-outline', 'portrait'], ['其他', 'images-outline', 'other']
  ] as const;
  const available = categories.filter(([, , key]) => categoryCounts[key] > 0);
  const prompts = ['最近 30 天', '大文件', ...available.slice(0, 3).map(([label]) => label)];

  return (
    <Screen tab>
      <TopBar title="发现" subtitle="用搜索重新找到你的照片" />
      <Pressable accessibilityRole="search" accessibilityLabel="搜索照片" style={({ pressed }) => pressed && styles.pressed} onPress={() => router.push('/search')}>
        <GlassSurface intensity={30} style={[styles.searchBox, { borderColor: theme.border }]}>
          <Ionicons name="search" size={25} color={theme.primary} />
          <Text style={[styles.searchText, { color: theme.muted }]}>搜索照片、时间或分类</Text>
          <Ionicons name="chevron-forward" size={23} color={theme.tertiary} />
        </GlassSurface>
      </Pressable>

      {available.length ? <>
        <SectionTitle title="按文件信息分类" />
        <GlassSurface intensity={30} style={[styles.grid, { borderColor: theme.border }]}>{available.map(([label, icon, key], index) => <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${categoryCounts[key]} 张`} key={key} style={[styles.categoryRow, { borderBottomColor: theme.border }, index === available.length - 1 && styles.lastRow]} onPress={() => router.push(`/photos?category=${key}`)}>
          <Ionicons name={icon} size={29} color={theme.primary} />
          <View style={{ flex: 1 }}><Text style={[styles.categoryTitle, { color: theme.text }]}>{label}</Text><Text style={[styles.categoryCount, { color: theme.muted }]}>{categoryCounts[key]} 张</Text></View>
          <Ionicons name="chevron-forward" size={23} color={theme.tertiary} />
        </Pressable>)}</GlassSurface>
      </> : <EmptyState icon="search-outline" title="等待照片进入发现" description="扫描相册后，有内容的分类会出现在这里。" />}

      {stats.active > 0 ? <><SectionTitle title="搜索示例" /><GlassSurface intensity={28} style={[styles.promptList, { borderColor: theme.border }]}>{prompts.map((prompt, index) => <Pressable accessibilityRole="button" accessibilityLabel={`搜索${prompt}`} key={prompt} style={[styles.prompt, { borderBottomColor: theme.border }, index === prompts.length - 1 && styles.lastRow]} onPress={() => router.push({ pathname: '/search', params: { q: prompt } })}><Text style={[styles.promptText, { color: theme.text }]}>{prompt}</Text><Ionicons name="chevron-forward" size={23} color={theme.tertiary} /></Pressable>)}</GlassSurface></> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { minHeight: 56, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  searchText: { flex: 1, ...typography.subheadline },
  grid: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  categoryRow: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryTitle: { ...typography.callout },
  categoryCount: { ...typography.footnote, marginTop: 2 },
  promptList: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  prompt: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  promptText: { ...typography.subheadline },
  lastRow: { borderBottomWidth: 0 },
  pressed: { opacity: 0.78 }
});
