import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { BottomActionBar } from '@/components/BottomActionBar';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { permanentlyDeleteAssets } from '@/services/photoIndexer';
import { removePhotoRows } from '@/db/database';
import { formatBytes, formatDate } from '@/utils/format';

export default function TrashScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { photos, refresh, changeManyStatus } = useAppStore();
  const items = photos.filter((photo) => photo.status === 'trashed');
  const bytes = items.reduce((sum, photo) => sum + photo.estimatedBytes, 0);
  const [deleting, setDeleting] = useState(false);
  const restoreAll = () => Alert.alert('恢复全部照片？', `将 ${items.length} 张照片恢复为可用状态。`, [{ text: '取消', style: 'cancel' }, { text: '恢复', onPress: () => void changeManyStatus(items.map((photo) => photo.id), 'active') }]);
  const deleteAll = () => {
    if (deleting) return;
    Alert.alert('永久删除？', `将永久删除 ${items.length} 张照片（${formatBytes(bytes)}）。此操作无法通过 Photo Inbox 恢复，系统还会再次请求确认。`, [{ text: '取消', style: 'cancel' }, { text: '永久删除', style: 'destructive', onPress: async () => {
      setDeleting(true);
      try { const ok = await permanentlyDeleteAssets(items.map((item) => item.assetId)); if (!ok) throw new Error('系统未完成照片删除'); await removePhotoRows(items.map((item) => item.id)); await refresh(); }
      catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '无法完成永久删除，请稍后重试。'); }
      finally { setDeleting(false); }
    } }]);
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回" style={styles.headerButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable><View style={styles.headerTitle}><Text style={[styles.title, { color: theme.text }]}>回收站</Text><Text style={[styles.subtitle, { color: theme.muted }]}>{items.length} 张 · {formatBytes(bytes)}</Text></View><View style={styles.headerButton} /></View><FlashList data={items} numColumns={3} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false} ListHeaderComponent={items.length ? <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}><Ionicons name="information-circle-outline" size={18} color={theme.primary} /><Text style={[styles.noticeText, { color: theme.muted }]}>这里是待删除队列。永久删除后才会调用系统照片删除接口。</Text></View> : null} ListEmptyComponent={<View style={[styles.empty, { paddingBottom: insets.bottom + 32 }]}><View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="checkmark" size={28} color={theme.success} /></View><Text style={[styles.emptyTitle, { color: theme.text }]}>回收站为空</Text><Text style={[styles.emptyText, { color: theme.muted }]}>整理页面移除的照片会先来到这里。</Text></View>} renderItem={({ item, index }) => <View style={[styles.tile, index % 3 === 2 && styles.lastColumn, { backgroundColor: theme.fillSecondary }]}><Image source={{ uri: item.uri }} style={styles.image} contentFit="cover" recyclingKey={item.id} /><Pressable accessibilityRole="button" accessibilityLabel={`恢复 ${formatDate(item.createdAt)} 的照片`} style={styles.restoreOne} onPress={() => void changeManyStatus([item.id], 'active')}><Ionicons name="arrow-undo" size={18} color="#fff" /></Pressable></View>} />{items.length ? <BottomActionBar><Pressable accessibilityRole="button" accessibilityLabel="全部恢复" style={[styles.action, { backgroundColor: theme.primarySoft }]} onPress={restoreAll}><Text style={[styles.restoreText, { color: theme.primary }]}>全部恢复</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={deleting ? '永久删除中' : '永久删除'} disabled={deleting} style={[styles.action, { backgroundColor: theme.primarySoft }, deleting && styles.disabled]} onPress={deleteAll}><Text style={[styles.deleteText, { color: theme.danger }]}>{deleting ? '删除中…' : '永久删除'}</Text></Pressable></BottomActionBar> : null}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, header: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerTitle: { alignItems: 'center' }, title: { ...typography.headline }, subtitle: { ...typography.caption, marginTop: 3 }, notice: { borderRadius: 14, padding: 14, flexDirection: 'row', gap: 8, marginBottom: 14 }, noticeText: { flex: 1, ...typography.footnote }, tile: { flex: 1, aspectRatio: 1, marginRight: 4, marginBottom: 4, borderRadius: 4, overflow: 'hidden' }, lastColumn: { marginRight: 0 }, image: { width: '100%', height: '100%' }, restoreOne: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.48)', alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', paddingTop: 80 }, emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { marginTop: 18, ...typography.title2 }, emptyText: { marginTop: 7, ...typography.subheadline }, action: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, restoreText: { ...typography.callout }, deleteText: { ...typography.callout }, disabled: { opacity: 0.55 }
});
