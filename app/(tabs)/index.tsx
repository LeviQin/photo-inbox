import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { findSimilarGroups } from '@/services/aiService';
import { formatBytes, formatDate } from '@/utils/format';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { photos, stats, indexing, progress, error, scan } = useAppStore();
  const activePhotos = photos.filter((photo) => photo.status !== 'trashed');
  const pendingPhotos = photos.filter((photo) => photo.status === 'active');
  const similarCount = findSimilarGroups(pendingPhotos).length;
  const organized = stats.total ? Math.round(((stats.kept + stats.trashed) / stats.total) * 100) : 0;
  const suggestions = [
    similarCount > 0 ? { icon: 'copy-outline' as const, title: '相似照片', value: `${similarCount} 组`, onPress: () => router.push('/similar') } : null,
    stats.screenshots > 0 ? { icon: 'phone-portrait-outline' as const, title: '截图', value: `${stats.screenshots} 张`, onPress: () => router.push('/photos?category=screenshot') } : null,
    stats.reclaimableBytes > 0 ? { icon: 'trash-outline' as const, title: '待清理', value: formatBytes(stats.reclaimableBytes), onPress: () => router.push('/trash') } : null
  ].filter(Boolean) as Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; value: string; onPress: () => void }>;

  return (
    <Screen>
      <TopBar title="Photo Inbox" subtitle="今天，整理一点就好" right={
        <Pressable accessibilityRole="button" accessibilityLabel="搜索照片" onPress={() => router.push('/search')} style={[styles.iconButton, { backgroundColor: theme.surface }]}>
          <Ionicons name="search" size={20} color={theme.text} />
        </Pressable>
      } />

      {stats.total === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="images-outline" size={28} color={theme.primary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>从本地相册开始</Text>
          <Text style={[styles.emptyText, { color: theme.muted }]}>照片只在设备本地建立索引，不会上传原图。</Text>
          <PrimaryButton label={indexing ? `正在扫描 ${progress} 张` : '允许访问并扫描'} loading={indexing} onPress={() => void scan()} />
          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        </View>
      ) : (
        <>
          <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.summaryNumber, { color: theme.text }]}>{stats.active.toLocaleString()}</Text>
                <Text style={[styles.summaryLabel, { color: theme.muted }]}>张待整理照片</Text>
              </View>
              <View style={[styles.progressBadge, { backgroundColor: theme.primarySoft }]}><Text style={[styles.progressText, { color: theme.primary }]}>{organized}% 已整理</Text></View>
            </View>
            <View style={[styles.summaryMeta, { borderTopColor: theme.border }]}>
              <Text style={[styles.metaText, { color: theme.muted }]}>{formatBytes(stats.estimatedBytes)} 图库</Text>
              <Text style={[styles.metaText, { color: theme.muted }]}>{stats.trashed} 张待清理</Text>
            </View>
          </View>

          <SectionTitle title={pendingPhotos.length ? '继续整理' : '今日进度'} />
          {pendingPhotos.length ? <Pressable accessibilityRole="button" accessibilityLabel={`继续整理 ${Math.min(50, pendingPhotos.length)} 张照片`} style={[styles.dailyCard, { backgroundColor: theme.primary }]} onPress={() => router.push('/review')}>
            <View style={{ flex: 1 }}><Text style={styles.dailyNumber}>{Math.min(50, pendingPhotos.length)}</Text><Text style={styles.dailyText}>张照片等待确认</Text><Text style={styles.dailyHint}>左滑移至回收站，右滑保留</Text></View><Ionicons name="arrow-forward" size={22} color="#fff" />
          </Pressable> : <View style={[styles.completedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="checkmark-circle" size={24} color={theme.success} /><Text style={[styles.completedText, { color: theme.text }]}>今天已经整理完了</Text></View>}

          {suggestions.length ? <>
            <SectionTitle title="建议处理" action="清理中心" onAction={() => router.push('/cleanup')} />
            <View style={styles.suggestionRow}>{suggestions.map((item) => <Suggestion key={item.title} {...item} theme={theme} />)}</View>
          </> : null}

          {activePhotos.length ? <>
            <SectionTitle title="最近照片" action="查看全部" onAction={() => router.push('/photos')} />
            <View style={styles.recentWrap}>
              {activePhotos.slice(0, 3).map((photo) => <Pressable accessibilityRole="imagebutton" accessibilityLabel={`打开 ${formatDate(photo.createdAt)} 的照片`} key={photo.id} style={styles.recentItem} onPress={() => router.push(`/photo/${photo.id}`)}>
                <Image source={{ uri: photo.uri }} style={styles.recentImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />
                <Text style={[styles.recentDate, { color: theme.muted }]}>{formatDate(photo.createdAt)}</Text>
              </Pressable>)}
            </View>
          </> : null}
        </>
      )}
    </Screen>
  );
}

function Suggestion({ icon, title, value, onPress, theme }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; onPress: () => void; theme: ReturnType<typeof useAppTheme> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${value}`} style={[styles.suggestion, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPress}>
    <View style={[styles.suggestionIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} size={20} color={theme.primary} /></View>
    <Text style={[styles.suggestionTitle, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.suggestionValue, { color: theme.muted }]}>{value}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { marginTop: 8, padding: 22, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  emptyTitle: { ...typography.headline },
  emptyText: { ...typography.subheadline, marginBottom: 4 },
  error: { ...typography.footnote },
  summary: { padding: 20, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  summaryNumber: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -1 },
  summaryLabel: { ...typography.subheadline, marginTop: 3 },
  progressBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  progressText: { ...typography.caption, fontWeight: '600' },
  summaryMeta: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  metaText: { ...typography.footnote },
  dailyCard: { minHeight: 112, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  dailyNumber: { color: '#fff', fontSize: 34, lineHeight: 40, fontWeight: '700' },
  dailyText: { color: '#fff', ...typography.callout, marginTop: 2 },
  dailyHint: { color: 'rgba(255,255,255,.78)', ...typography.footnote, marginTop: 7 },
  completedCard: { minHeight: 72, paddingHorizontal: 18, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  completedText: { ...typography.callout },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestion: { flex: 1, minWidth: 150, minHeight: 112, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  suggestionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { ...typography.footnote, fontWeight: '600', marginTop: 11 },
  suggestionValue: { ...typography.caption, marginTop: 3 },
  recentWrap: { flexDirection: 'row', gap: 8 },
  recentItem: { flex: 1, minWidth: 44 },
  recentImage: { width: '100%', aspectRatio: 1, backgroundColor: '#D9D9DE' },
  recentDate: { ...typography.caption, marginTop: 5 }
});
