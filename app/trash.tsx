import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@/components/GeneratedIcon';
import { BottomActionBar } from '@/components/BottomActionBar';
import { GlassSurface } from '@/components/GlassSurface';
import { AmbientBackground } from '@/components/AmbientBackground';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { permanentlyDeleteAssets } from '@/services/photoIndexer';
import { getPhotoIdsByStatus, getPhotoRefs, getTrashedPhotoRefsByIds, removePhotoRowsByAssetIds } from '@/db/database';
import { effectivePhotoBytes } from '@/services/aiService';
import { formatBytes, formatDate } from '@/utils/format';
import { usePaginatedPhotos } from '@/hooks/usePaginatedPhotos';
import { confirmAction, showMessage } from '@/services/confirmation';
import { photoGridIndexAtPoint } from '@/services/gridSelection';

export default function TrashScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { stats, refresh, restorePhotos, restoreAllPhotos } = useAppStore();
  const { items, loading, loadingMore, error, refresh: reload, loadMore } = usePaginatedPhotos({ status: 'trashed' });
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [listHeaderHeight, setListHeaderHeight] = useState(0);
  const listRef = useRef<View>(null);
  const listOrigin = useRef({ x: 0, y: 0 });
  const scrollOffset = useRef(0);
  const dragStartId = useRef<string | null>(null);
  const dragLastId = useRef<string | null>(null);
  const dragTargetSelected = useRef(true);
  const dragActive = useRef(false);
  const dragOccurred = useRef(false);
  const selectedPhotos = items.filter((photo) => selectedIds.includes(photo.id));
  const allSelected = stats.trashed > 0 && selectedIds.length === stats.trashed;
  const selectedBytes = allSelected ? stats.reclaimableBytes : selectedPhotos.reduce((sum, photo) => sum + effectivePhotoBytes(photo), 0);
  const trashSizeSource = stats.trashed > 0 && stats.measuredTrashedCount === stats.trashed ? '真实大小' : '含估算';
  const sizeSource = !selecting || allSelected ? trashSizeSource : selectedPhotos.length === selectedIds.length && selectedPhotos.length && selectedPhotos.every((photo) => photo.actualBytes !== null) ? '真实大小' : '含估算';
  const stopSelecting = () => { setSelectedIds([]); setSelecting(false); };
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const setPhotoSelected = useCallback((id: string, selected: boolean) => {
    setSelectedIds((current) => current.includes(id) === selected ? current : selected ? [...current, id] : current.filter((item) => item !== id));
  }, []);
  const measureList = () => listRef.current?.measureInWindow((x, y) => { listOrigin.current = { x, y }; });
  const toggleSelectAll = async () => {
    if (selectAllBusy) return;
    if (allSelected) { setSelectedIds([]); return; }
    setSelectAllBusy(true);
    try { setSelectedIds(await getPhotoIdsByStatus('trashed')); }
    catch (cause) { showMessage('读取照片失败', cause instanceof Error ? cause.message : '无法读取回收站照片，请重试。'); }
    finally { setSelectAllBusy(false); }
  };
  const selectionResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => selecting && Boolean(dragStartId.current) && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      dragActive.current = true;
      dragOccurred.current = true;
      const id = dragStartId.current;
      if (id) {
        setPhotoSelected(id, dragTargetSelected.current);
        dragLastId.current = id;
      }
    },
    onPanResponderMove: (_, gesture) => {
      if (!dragActive.current) return;
      const index = photoGridIndexAtPoint({
        pageX: gesture.moveX,
        pageY: gesture.moveY,
        originX: listOrigin.current.x,
        originY: listOrigin.current.y,
        scrollOffset: scrollOffset.current,
        headerHeight: listHeaderHeight,
        horizontalPadding: 16,
        tileSide: (width - 40) / 3,
        gap: 4,
        columns: 3,
        itemCount: items.length
      });
      const id = index === null ? null : items[index]?.id ?? null;
      if (id && id !== dragLastId.current) {
        setPhotoSelected(id, dragTargetSelected.current);
        dragLastId.current = id;
      }
    },
    onPanResponderRelease: () => {
      dragActive.current = false;
      dragStartId.current = null;
      dragLastId.current = null;
    },
    onPanResponderTerminate: () => {
      dragActive.current = false;
      dragStartId.current = null;
      dragLastId.current = null;
    }
  }), [items, listHeaderHeight, selecting, setPhotoSelected, width]);

  const restore = async (ids?: string[]) => {
    if (busy || restoringId) return;
    setBusy(true);
    try {
      if (ids) await restorePhotos(ids);
      else await restoreAllPhotos();
      stopSelecting();
      showMessage('恢复完成', `已恢复 ${ids?.length ?? stats.trashed} 张照片。原先已保留的照片仍保持已保留状态。`);
    } catch (cause) {
      showMessage('恢复失败', cause instanceof Error ? cause.message : '请稍后重试。');
    } finally { setBusy(false); }
  };
  const confirmRestore = () => {
    const count = selecting ? selectedIds.length : stats.trashed;
    if (!count || busy) return;
    confirmAction(`恢复${selecting ? '所选' : '全部'}照片？`, `将 ${count} 张照片恢复到图库。`, '恢复', () => void restore(selecting ? selectedIds : undefined));
  };
  const restoreOne = async (id: string) => {
    if (busy || restoringId) return;
    setRestoringId(id);
    try { await restorePhotos([id]); }
    catch (cause) { showMessage('恢复失败', cause instanceof Error ? cause.message : '请稍后重试。'); }
    finally { setRestoringId(null); }
  };

  const remove = async (ids?: string[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const refs = ids ? await getTrashedPhotoRefsByIds(ids) : await getPhotoRefs('trashed');
      const result = await permanentlyDeleteAssets(refs);
      await removePhotoRowsByAssetIds(result.deletedAssetIds);
      await refresh();
      if (selecting) stopSelecting();
      const deleted = new Set(result.deletedAssetIds);
      const confirmedBytes = refs.filter((photo) => deleted.has(photo.assetId)).reduce((sum, photo) => sum + effectivePhotoBytes(photo), 0);
      const confirmedActual = refs.filter((photo) => deleted.has(photo.assetId)).every((photo) => photo.actualBytes !== null);
      showMessage(result.cancelled ? '已取消删除' : '删除结果', `成功删除 ${result.deletedAssetIds.length} 张，失败 ${result.failedAssetIds.length} 张。${result.deletedAssetIds.length ? `已删除照片大小 ${formatBytes(confirmedBytes)}（${confirmedActual ? '真实大小' : '含估算'}）。` : ''}失败或取消的照片仍留在回收站；实际空间变化以系统相册为准。`);
    } catch (cause) {
      showMessage('删除失败', cause instanceof Error ? cause.message : '无法完成永久删除，请稍后重试。');
    } finally { setBusy(false); }
  };
  const confirmDelete = () => {
    const count = selecting ? selectedIds.length : stats.trashed;
    if (!count || busy) return;
    const bytes = selecting ? selectedBytes : stats.reclaimableBytes;
    confirmAction('永久删除？', `将请求系统删除 ${count} 张照片（大小 ${formatBytes(bytes)}，${sizeSource}）。此操作无法通过图序恢复，系统还会再次请求确认。`, '永久删除', () => void remove(selecting ? selectedIds : undefined), true);
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}><AmbientBackground />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={selecting ? '取消选择' : '返回'} style={styles.headerButton} onPress={() => selecting ? stopSelecting() : router.back()}>
        {selecting ? <Text style={{ color: theme.primary }}>取消</Text> : <Ionicons name="chevron-back" size={29} color={theme.text} />}
      </Pressable>
      <View style={styles.headerTitle}>
        <Text style={[styles.title, { color: theme.text }]}>回收站</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>{selecting ? `已选 ${selectedIds.length} 张` : stats.trashed ? `${stats.trashed} 张 · ${formatBytes(stats.reclaimableBytes)} · ${trashSizeSource}` : '0 张'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={selecting ? (allSelected ? '取消全选' : '全选') : '选择回收站照片'} disabled={!stats.trashed || busy || selectAllBusy} style={styles.headerButton} onPress={() => selecting ? void toggleSelectAll() : setSelecting(true)}>
        <Text style={{ color: theme.primary }}>{selecting ? (selectAllBusy ? '读取中…' : allSelected ? '取消全选' : '全选') : '选择'}</Text>
      </Pressable>
    </View>
    <View ref={listRef} style={styles.grid} onLayout={measureList} {...selectionResponder.panHandlers}><FlashList data={items} numColumns={3} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false} onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} onEndReached={loadMore} onEndReachedThreshold={0.35} ListFooterComponent={loadingMore ? <Text style={[styles.loading, { color: theme.muted }]}>正在加载更多…</Text> : null} ListHeaderComponent={items.length ? <View onLayout={(event) => setListHeaderHeight(event.nativeEvent.layout.height + 10)}><GlassSurface intensity={30} style={[styles.notice, { borderColor: theme.border }]}><Ionicons name="information-circle-outline" size={25} color={theme.primary} /><Text style={[styles.noticeText, { color: theme.muted }]}>这里是待删除队列。永久删除后才会调用系统照片删除接口。</Text></GlassSurface></View> : null} ListEmptyComponent={<View style={[styles.empty, { paddingBottom: insets.bottom + 32 }]}><EmptyState icon={loading ? 'scan-outline' : error ? 'alert-circle-outline' : 'checkmark-circle-outline'} title={loading ? '正在读取回收站…' : error ? '读取回收站失败' : '回收站为空'} description={error ?? '整理页面移除的照片会先来到这里。'} />{error ? <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.retry}><Text style={{ color: theme.primary }}>重试</Text></Pressable> : null}</View>} renderItem={({ item, index }) => <Pressable accessibilityRole={selecting ? 'checkbox' : 'imagebutton'} accessibilityState={selecting ? { checked: selectedIds.includes(item.id) } : undefined} aria-checked={selecting ? selectedIds.includes(item.id) : undefined} accessibilityLabel={selecting ? `选择 ${item.filename}` : `${formatDate(item.createdAt)} 的照片`} onTouchStart={() => { if (selecting) { dragStartId.current = item.id; dragLastId.current = null; dragTargetSelected.current = !selectedIds.includes(item.id); dragOccurred.current = false; } }} onTouchEnd={() => { if (!dragActive.current) dragStartId.current = null; }} onTouchCancel={() => { dragStartId.current = null; }} onPress={() => { if (selecting) { if (dragOccurred.current) { dragOccurred.current = false; return; } toggle(item.id); dragStartId.current = null; } else router.push(`/photo/${item.id}`); }} style={[styles.tile, index % 3 === 2 && styles.lastColumn, { backgroundColor: theme.fillSecondary }]}><Image source={{ uri: item.uri }} style={styles.image} contentFit="cover" recyclingKey={item.id} />{selecting ? <View style={[styles.check, { backgroundColor: selectedIds.includes(item.id) ? theme.primary : 'rgba(0,0,0,.48)' }]}><Ionicons name={selectedIds.includes(item.id) ? 'checkmark' : 'ellipse-outline'} size={20} color="#fff" /></View> : <Pressable accessibilityRole="button" accessibilityLabel={`恢复 ${formatDate(item.createdAt)} 的照片`} disabled={Boolean(restoringId) || busy} style={[styles.restoreOne, (restoringId || busy) && styles.disabled]} onPress={(event) => { event.stopPropagation(); void restoreOne(item.id); }}><Ionicons name="arrow-undo" size={22} color="#fff" /></Pressable>}</Pressable>} />
    </View>
    {stats.trashed ? <BottomActionBar><Pressable accessibilityRole="button" accessibilityLabel={selecting ? '恢复所选' : '全部恢复'} disabled={busy || Boolean(restoringId) || (selecting && !selectedIds.length)} style={[styles.action, { backgroundColor: theme.primarySoft }, (busy || (selecting && !selectedIds.length)) && styles.disabled]} onPress={confirmRestore}><Text style={[styles.restoreText, { color: theme.primary }]}>{busy ? '处理中…' : selecting ? '恢复所选' : '全部恢复'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={selecting ? '永久删除所选' : '永久删除全部'} disabled={busy || Boolean(restoringId) || (selecting && !selectedIds.length)} style={[styles.action, { backgroundColor: theme.primarySoft }, (busy || (selecting && !selectedIds.length)) && styles.disabled]} onPress={confirmDelete}><Text style={[styles.deleteText, { color: theme.danger }]}>{selecting ? '删除所选' : '永久删除'}</Text></Pressable></BottomActionBar> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, grid: { flex: 1 }, header: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerButton: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerTitle: { alignItems: 'center' }, title: { ...typography.headline }, subtitle: { ...typography.caption, marginTop: 3 }, notice: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', gap: 8, marginBottom: 10 }, noticeText: { flex: 1, ...typography.footnote }, tile: { flex: 1, aspectRatio: 1, marginRight: 4, marginBottom: 4, borderRadius: 4, overflow: 'hidden' }, lastColumn: { marginRight: 0 }, image: { width: '100%', height: '100%' }, restoreOne: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.48)', alignItems: 'center', justifyContent: 'center' }, check: { position: 'absolute', top: 5, right: 5, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingTop: 60 }, retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, loading: { minHeight: 44, textAlign: 'center', textAlignVertical: 'center', ...typography.footnote }, action: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, restoreText: { ...typography.callout }, deleteText: { ...typography.callout }, disabled: { opacity: 0.55 } });
