import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/EmptyState';
import { PhotoTile } from '@/components/PhotoTile';
import { useAppTheme, typography } from '@/constants/theme';
import { findSimilarGroups } from '@/services/aiService';
import { useAppStore } from '@/store/useAppStore';

export default function SimilarScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const photos = useAppStore((state) => state.photos);
  const changeManyStatus = useAppStore((state) => state.changeManyStatus);
  const groups = useMemo(() => findSimilarGroups(photos.filter((photo) => photo.status === 'active')), [photos]);
  const tileSize = Math.min(136, Math.max(88, Math.floor(width * 0.28)));
  const trashDuplicates = (bestId: string, itemIds: string[]) => {
    const duplicateIds = itemIds.filter((id) => id !== bestId);
    Alert.alert('整理相似照片？', `保留评分最高的一张，并将另外 ${duplicateIds.length} 张移入回收站。`, [{ text: '取消', style: 'cancel' }, { text: '移入回收站', style: 'destructive', onPress: () => void changeManyStatus(duplicateIds, 'trashed') }]);
  };

  return <Screen scroll={false} contentStyle={styles.screen}><View style={styles.header}><TopBar title="相似照片" subtitle="先确认，再整理重复项" back /></View><View style={styles.listWrap}>{groups.length ? <FlashList data={groups} keyExtractor={(group) => group.id} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} renderItem={({ item }) => <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.groupHeader}><View style={{ flex: 1 }}><Text style={[styles.groupTitle, { color: theme.text }]}>{item.items.length} 张相似照片</Text><Text style={[styles.groupHint, { color: theme.muted }]}>评分最高的照片已标记为推荐保留</Text></View><Pressable accessibilityRole="button" accessibilityLabel="整理重复项" style={[styles.cleanupButton, { backgroundColor: theme.primarySoft }]} onPress={() => trashDuplicates(item.bestId, item.items.map((photo) => photo.id))}><Ionicons name="trash-outline" size={16} color={theme.danger} /><Text style={[styles.cleanupText, { color: theme.danger }]}>整理重复项</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>{item.items.map((photo) => <View key={photo.id} style={styles.photoWrap}><PhotoTile photo={photo} size={tileSize} onPress={() => router.push(`/photo/${photo.id}`)} />{photo.id === item.bestId ? <View style={[styles.bestBadge, { backgroundColor: theme.success }]}><Text style={styles.bestText}>推荐保留</Text></View> : null}</View>)}</ScrollView></View>} /> : <EmptyState icon="checkmark-circle-outline" title="暂时没有相似照片" description="扫描到连拍或尺寸接近的照片后，会在这里分组显示。" />}</View></Screen>;
}

const styles = StyleSheet.create({ screen: { paddingHorizontal: 0, paddingBottom: 0 }, header: { paddingHorizontal: 20 }, listWrap: { flex: 1 }, group: { marginBottom: 16, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth }, groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, groupTitle: { ...typography.callout }, groupHint: { ...typography.footnote, marginTop: 4 }, cleanupButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 }, cleanupText: { ...typography.caption, fontWeight: '600' }, tiles: { gap: 8, paddingTop: 13 }, photoWrap: { position: 'relative' }, bestBadge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7 }, bestText: { color: '#fff', ...typography.caption, fontWeight: '600' }
});
