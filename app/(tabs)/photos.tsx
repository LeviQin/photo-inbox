import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { PhotoGrid } from '@/components/PhotoGrid';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { PhotoCategory } from '@/types/photo';

const filters: Array<{ key: 'all' | PhotoCategory; label: string }> = [
  { key: 'all', label: '全部' }, { key: 'screenshot', label: '截图' }, { key: 'document', label: '文档' },
  { key: 'travel', label: '旅行' }, { key: 'food', label: '美食' }, { key: 'pet', label: '宠物' },
  { key: 'portrait', label: '人物' }, { key: 'other', label: '其他' }
];

export default function PhotosScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ category?: string }>();
  const categoryParam = typeof params.category === 'string' ? params.category : undefined;
  const initial = filters.some((item) => item.key === categoryParam) ? categoryParam as 'all' | PhotoCategory : 'all';
  const [filter, setFilter] = useState<'all' | PhotoCategory>(initial);
  const photos = useAppStore((state) => state.photos);
  useEffect(() => { setFilter(initial); }, [initial]);
  const active = useMemo(() => photos.filter((photo) => photo.status !== 'trashed' && (filter === 'all' || photo.category === filter)), [photos, filter]);

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}><TopBar title="图库" subtitle={`${active.length} 张照片`} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`筛选${item.label}`} accessibilityState={{ selected: filter === item.key }} key={item.key} style={styles.chipHit} onPress={() => setFilter(item.key)}>
          <View style={[styles.chip, { backgroundColor: filter === item.key ? theme.text : theme.surface, borderColor: theme.border }]}><Text style={[styles.chipText, { color: filter === item.key ? theme.background : theme.muted }]}>{item.label}</Text></View>
        </Pressable>)}
      </ScrollView>
      <View style={styles.grid}>{active.length ? <PhotoGrid photos={active} columns={3} /> : <EmptyState title={filter === 'all' ? '图库为空' : `暂无${filters.find((item) => item.key === filter)?.label ?? ''}照片`} description="扫描系统相册后，Photo Inbox 会在这里按类型组织照片。" />}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingBottom: 0 },
  header: { paddingHorizontal: 20 },
  filters: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
  chipHit: { minHeight: 44, justifyContent: 'center' },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  chipText: { ...typography.caption, fontWeight: '600' },
  grid: { flex: 1 }
});
