import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/EmptyState';
import { GlassSurface } from '@/components/GlassSurface';
import { Ionicons } from '@/components/GeneratedIcon';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { usePaginatedPhotos } from '@/hooks/usePaginatedPhotos';
import type { PhotoCategory, PhotoRecord } from '@/types/photo';
import { getPhotoIdsForDay, getPhotoSelectionSummary } from '@/db/database';
import { formatBytes } from '@/utils/format';
import { confirmAction, showMessage } from '@/services/confirmation';

const filters: Array<{ key: 'all' | PhotoCategory; label: string }> = [
  { key: 'all', label: '全部' }, { key: 'screenshot', label: '截图' }, { key: 'document', label: '文档' },
  { key: 'travel', label: '旅行' }, { key: 'food', label: '美食' }, { key: 'pet', label: '宠物' },
  { key: 'portrait', label: '人物' }, { key: 'other', label: '其他' }
];

type GalleryItem = { type: 'header'; id: string; label: string; count: number } | { type: 'row'; id: string; photos: PhotoRecord[] };

function photoAspect(photo: PhotoRecord) {
  if (!photo.width || !photo.height) return 1;
  return Math.max(0.72, Math.min(1.75, photo.width / photo.height));
}

function monthKey(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'unknown';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '日期未知';
  const date = new Date(timestamp);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

function buildGalleryItems(photos: PhotoRecord[], columns: 3 | 4 | 5): GalleryItem[] {
  const result: GalleryItem[] = [];
  let currentMonth = '';
  let monthPhotos: PhotoRecord[] = [];
  const flush = () => {
    if (!monthPhotos.length) return;
    result.push({ type: 'header', id: `month-${currentMonth}`, label: monthLabel(monthPhotos[0]!.createdAt), count: monthPhotos.length });
    while (monthPhotos.length) {
      const photosInRow = monthPhotos.splice(0, columns);
      result.push({ type: 'row', id: `row-${photosInRow.map((photo) => photo.id).join('-')}`, photos: photosInRow });
    }
  };
  for (const photo of photos) {
    const key = monthKey(photo.createdAt);
    if (key !== currentMonth) {
      flush();
      currentMonth = key;
    }
    monthPhotos.push(photo);
  }
  flush();
  return result;
}

export default function PhotosScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ category?: string; before?: string }>();
  const categoryParam = typeof params.category === 'string' ? params.category : undefined;
  const before = typeof params.before === 'string' && Number.isFinite(Number(params.before)) ? Number(params.before) : undefined;
  const initial = filters.some((item) => item.key === categoryParam) ? categoryParam as 'all' | PhotoCategory : 'all';
  const [filter, setFilter] = useState<'all' | PhotoCategory>(initial);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionDay, setSelectionDay] = useState<number | null>(null);
  const [selectionSummary, setSelectionSummary] = useState<Awaited<ReturnType<typeof getPhotoSelectionSummary>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stats = useAppStore((state) => state.stats);
  const revision = useAppStore((state) => state.dataRevision);
  const columns = useAppStore((state) => state.reviewPreferences.galleryColumns);
  const setGalleryDensity = useAppStore((state) => state.setGalleryDensity);
  const changeManyStatus = useAppStore((state) => state.changeManyStatus);
  const setFavorites = useAppStore((state) => state.setFavorites);
  const pinchStart = useRef<number | null>(null);
  useEffect(() => { setFilter(initial); }, [initial]);
  const { items: active, loading, loadingMore, error, refresh, loadMore } = usePaginatedPhotos({ status: 'available', category: filter === 'all' ? undefined : filter, before });
  const galleryItems = useMemo(() => buildGalleryItems(active, columns), [active, columns]);
  const total = filter === 'all' ? stats.active : stats.categoryCounts[filter];
  const topInset = topOverlayHeight > 0 ? topOverlayHeight + 4 : insets.top + 132;
  const bottomInset = 16;
  const summaryReady = selectionSummary !== null && selectionSummary.count === selectedIds.length;
  const allFavorite = summaryReady && selectionSummary.allFavorite;
  const visibleFilters = filters.filter((item) => item.key === 'all' || item.key === filter || stats.categoryCounts[item.key] > 0);
  useEffect(() => {
    let active = true;
    setSelectionSummary(null);
    void getPhotoSelectionSummary(selectedIds).then((summary) => { if (active) setSelectionSummary(summary); });
    return () => { active = false; };
  }, [selectedIds, revision]);
  const toggleSelection = (photo: PhotoRecord) => {
    if (busy) return;
    const next = selectedIds.includes(photo.id) ? selectedIds.filter((item) => item !== photo.id) : [...selectedIds, photo.id];
    setSelectedIds(next);
    const anchor = next.includes(photo.id) ? photo.createdAt : active.find((item) => item.id === next.at(-1))?.createdAt;
    setSelectionDay(anchor && anchor > 0 ? anchor : null);
  };
  const finishSelection = () => { setSelectedIds([]); setSelectionDay(null); setSelecting(false); };
  const selectSameDay = () => {
    if (selectionDay === null || !selectedIds.length || busy) return;
    setBusy(true);
    void getPhotoIdsForDay(selectionDay, { category: filter === 'all' ? undefined : filter, before })
      .then((ids) => setSelectedIds((current) => [...new Set([...current, ...ids])]))
      .catch((cause) => showMessage('选择失败', cause instanceof Error ? cause.message : '请稍后重试。'))
      .finally(() => setBusy(false));
  };
  const moveSelected = () => {
    if (!selectedIds.length || !summaryReady || busy) return;
    confirmAction('移入回收站？', `已选 ${selectionSummary.count} 张（${formatBytes(selectionSummary.bytes)}，${selectionSummary.measured} 张已测真实大小）。系统照片不会立即删除。`, '移入回收站', () => {
      setBusy(true);
      void changeManyStatus(selectedIds, 'trashed')
        .then(finishSelection)
        .catch((cause) => showMessage('操作失败', cause instanceof Error ? cause.message : '请稍后重试。'))
        .finally(() => setBusy(false));
    }, true);
  };
  const favoriteSelected = () => {
    if (!selectedIds.length || !summaryReady || busy) return;
    setBusy(true);
    void setFavorites(selectedIds, !allFavorite)
      .then(finishSelection)
      .catch((cause) => showMessage('操作失败', cause instanceof Error ? cause.message : '请稍后重试。'))
      .finally(() => setBusy(false));
  };
  const setColumns = (next: number) => void setGalleryDensity(Math.max(3, Math.min(5, next)) as 3 | 4 | 5);
  const touchDistance = (touches: readonly { pageX: number; pageY: number }[]) => touches.length < 2 ? null : Math.hypot(touches[0]!.pageX - touches[1]!.pageX, touches[0]!.pageY - touches[1]!.pageY);

  return <View style={[styles.screen, { backgroundColor: theme.background }]} onTouchStart={(event) => { pinchStart.current = touchDistance(event.nativeEvent.touches); }} onTouchMove={(event) => { const distance = touchDistance(event.nativeEvent.touches); if (!distance || !pinchStart.current) return; const ratio = distance / pinchStart.current; if (ratio > 1.2 && columns > 3) { pinchStart.current = distance; setColumns(columns - 1); } else if (ratio < 0.8 && columns < 5) { pinchStart.current = distance; setColumns(columns + 1); } }} onTouchEnd={() => { pinchStart.current = null; }}>
    <View style={styles.grid}>{active.length ? <FlashList data={galleryItems} key={`gallery-${columns}`} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomInset + (selecting ? 82 : 0) }} onEndReached={loadMore} onEndReachedThreshold={0.65} ListFooterComponent={loadingMore ? <Text style={[styles.loadingMore, { color: theme.muted }]}>正在加载更多…</Text> : null} renderItem={({ item }) => item.type === 'header' ? <View style={[styles.monthHeader, { backgroundColor: theme.background }]}><Text style={[styles.monthText, { color: theme.text }]}>{item.label}</Text><Text style={[styles.monthCount, { color: theme.muted }]}>{item.count} 张</Text></View> : <View style={styles.photoRow}>{(() => { const fullRow = item.photos.length === columns; const ratios = item.photos.map(photoAspect); const rowHeight = fullRow ? (width - 2 * (item.photos.length - 1)) / ratios.reduce((sum, ratio) => sum + ratio, 0) : width / columns; return item.photos.map((photo, index) => <Pressable key={photo.id} accessibilityRole={selecting ? 'checkbox' : 'imagebutton'} accessibilityState={selecting ? { checked: selectedIds.includes(photo.id) } : undefined} aria-checked={selecting ? selectedIds.includes(photo.id) : undefined} accessibilityLabel={selecting ? `选择 ${photo.filename}` : `打开 ${photo.filename}`} style={[styles.photoTile, { width: rowHeight * ratios[index]!, height: rowHeight }]} onLongPress={() => { if (!selecting) { setSelecting(true); setSelectionDay(photo.createdAt > 0 ? photo.createdAt : null); setSelectedIds([photo.id]); } }} onPress={() => selecting ? toggleSelection(photo) : router.push(`/photo/${photo.id}`)}><Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />{selecting ? <View style={[styles.check, { backgroundColor: selectedIds.includes(photo.id) ? theme.primary : 'rgba(0,0,0,.45)' }]}><Ionicons name={selectedIds.includes(photo.id) ? 'checkmark' : 'ellipse-outline'} size={20} color="#fff" /></View> : null}</Pressable>); })()}</View>} /> : <View style={[styles.empty, { paddingTop: topInset, paddingBottom: bottomInset }]}><EmptyState title={loading ? '正在读取照片…' : error ? '读取图库失败' : filter === 'all' ? '图库为空' : `暂无${filters.find((item) => item.key === filter)?.label ?? ''}照片`} description={loading ? '照片索引保存在当前设备。' : error ?? '扫描系统相册后，图序会在这里按类型组织照片。'} />{error ? <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><Text style={{ color: theme.primary }}>重试</Text></Pressable> : null}</View>}</View>
    <View onLayout={(event) => setTopOverlayHeight(event.nativeEvent.layout.height)} style={[styles.topOverlay, { paddingTop: insets.top, backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <TopBar title="图库" subtitle={selecting ? `已选 ${selectedIds.length} 张 · 已加载 ${active.length} 张` : before ? `指定日期前 · 已加载 ${active.length} 张` : `${total.toLocaleString()} 张照片`} right={<View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="搜索照片" style={styles.headerButton} onPress={() => router.push('/search')}><Ionicons name="search" size={22} color={theme.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={selecting ? '取消选择' : '批量选择'} style={styles.selectButton} onPress={() => selecting ? finishSelection() : setSelecting(true)}><Text style={[styles.selectText, { color: theme.primary }]}>{selecting ? '取消' : '选择'}</Text></Pressable></View>} />
      <View style={styles.filterRow}>
        <ScrollView horizontal style={styles.filtersScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {visibleFilters.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={`筛选${item.label}`} accessibilityState={{ selected }} key={item.key} style={styles.chipHit} onPress={() => { setFilter(item.key); setSelectedIds([]); setSelectionDay(null); }}>
                <View style={[styles.chip, { backgroundColor: selected ? theme.primarySoft : theme.fillSecondary, borderColor: selected ? theme.primarySoft : theme.fillSecondary }]}>
                  <Text style={[styles.chipText, { color: selected ? theme.primary : theme.muted }]}>{item.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {before ? <Pressable accessibilityRole="button" accessibilityLabel="清除日期筛选" style={styles.dateFilter} onPress={() => router.replace(`/photos?category=${filter}`)}><Text style={{ color: theme.primary }}>日期 ×</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`当前 ${columns} 列，调整网格密度`} style={[styles.densityButton, { borderLeftColor: theme.border }]} onPress={() => setColumns(columns >= 5 ? 3 : columns + 1)}>
          <Text style={[styles.densityText, { color: theme.muted }]}>{columns}列</Text>
          <Ionicons name="chevron-down" size={16} color={theme.muted} />
        </Pressable>
      </View>
    </View>
    {selecting ? <GlassSurface intensity={50} style={[styles.selectionBar, { bottom: bottomInset + 4, borderColor: theme.border }]}>
      <View style={styles.selectionMeta}><Text style={[styles.selectionTitle, { color: theme.text }]}>{selectedIds.length} 张已选择</Text><Text style={[styles.selectionHint, { color: theme.muted }]}>{summaryReady ? formatBytes(selectionSummary.bytes) + ' · ' + selectionSummary.measured + ' 张实测' : '正在统计大小…'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="选择同日照片" disabled={busy || selectionDay === null} onPress={selectSameDay} style={[styles.selectionAction, { backgroundColor: theme.primarySoft }, (busy || selectionDay === null) && styles.disabled]}><Text style={{ color: theme.primary }}>同日</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={allFavorite ? '取消收藏所选' : '收藏所选'} disabled={busy || !selectedIds.length || !summaryReady} onPress={favoriteSelected} style={[styles.selectionAction, { backgroundColor: theme.primarySoft }, (!selectedIds.length || busy || !summaryReady) && styles.disabled]}><Ionicons name={allFavorite ? 'heart-dislike-outline' : 'heart-outline'} size={23} color={theme.primary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="移入回收站所选" disabled={busy || !selectedIds.length || !summaryReady} onPress={moveSelected} style={[styles.selectionAction, { backgroundColor: theme.primarySoft }, (!selectedIds.length || busy || !summaryReady) && styles.disabled]}><Ionicons name="trash-outline" size={23} color={theme.danger} /></Pressable>
    </GlassSurface> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' }, topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, elevation: 2, borderBottomWidth: StyleSheet.hairlineWidth }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, selectButton: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, selectText: { ...typography.footnote, fontWeight: '600' }, filterRow: { height: 52, flexDirection: 'row', alignItems: 'center' }, dateFilter: { minWidth: 62, height: 44, alignItems: 'center', justifyContent: 'center' }, densityButton: { minWidth: 64, height: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderLeftWidth: StyleSheet.hairlineWidth }, densityText: { ...typography.caption }, filtersScroll: { height: 44, flex: 1, minWidth: 0 }, filters: { height: 44, paddingHorizontal: 20, paddingRight: 12, gap: 8, alignItems: 'center' }, chipHit: { minHeight: 44, justifyContent: 'center' }, chip: { height: 32, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth }, chipText: { ...typography.caption, fontWeight: '600' }, grid: { flex: 1 }, empty: { flex: 1, paddingHorizontal: 20 }, monthHeader: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthText: { ...typography.callout }, monthCount: { ...typography.caption }, photoRow: { flexDirection: 'row', gap: 2, marginBottom: 2, alignItems: 'flex-start' }, photoTile: { minWidth: 44, minHeight: 44, borderRadius: 4, overflow: 'hidden' }, loadingMore: { ...typography.caption, textAlign: 'center', paddingVertical: 20 },
  check: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, selectionBar: { position: 'absolute', left: 12, right: 12, minHeight: 66, borderWidth: 1, borderRadius: 17, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 4 }, selectionMeta: { flex: 1 }, selectionTitle: { ...typography.footnote, fontWeight: '700' }, selectionHint: { ...typography.caption, marginTop: 2 }, selectionAction: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }
});
