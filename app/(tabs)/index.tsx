import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@/components/GeneratedIcon';
import { Image } from 'expo-image';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { PhotoRecord } from '@/types/photo';
import { formatBytes, formatDate } from '@/utils/format';
import { openPhotoPermissionSettings } from '@/services/photoPermissionService';
import { getSimilarityCandidates } from '@/db/database';
import { findSimilarGroups, similarityProfiles } from '@/services/aiService';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { photos, stats, loading, initialized, indexing, progress, error, initialize, scan, refresh, dailyReviewed, permission, reviewPreferences, activeReviewSession, dataRevision } = useAppStore();
  const activePhotos = photos.filter((photo) => photo.status !== 'trashed');
  const dailyProgress = Math.min(100, Math.round((dailyReviewed / reviewPreferences.dailyTarget) * 100));
  const sourceLabel = activeReviewSession ? ({ all: '全部待整理', screenshot: '截图', large: '大文件', recent: '最近 30 天', year: `${activeReviewSession.sourceValue ?? ''} 年` } as const)[activeReviewSession.source] : null;
  const sessionDone = activeReviewSession ? activeReviewSession.keptCount + activeReviewSession.trashedCount : 0;
  const [similarGroupCount, setSimilarGroupCount] = useState(0);
  const emptyAction = !permission.granted && !permission.canAskAgain ? () => void openPhotoPermissionSettings() : () => void scan();
  const emptyActionLabel = indexing ? `正在扫描 ${progress} 张` : !permission.granted ? permission.canAskAgain ? '允许访问并扫描' : '打开系统设置' : '重新扫描相册';

  useEffect(() => {
    let active = true;
    const level = reviewPreferences.similarityLevel;
    const profile = similarityProfiles[level];
    if (!initialized || !stats.active) {
      setSimilarGroupCount(0);
      return () => { active = false; };
    }
    void getSimilarityCandidates({ timeWindowMs: profile.timeWindowMs, ratioTolerance: profile.ratioTolerance })
      .then((candidates) => {
        if (active) setSimilarGroupCount(findSimilarGroups(candidates, level).length);
      })
      .catch(() => { if (active) setSimilarGroupCount(0); });
    return () => { active = false; };
  }, [dataRevision, initialized, reviewPreferences.similarityLevel, stats.active]);

  const suggestions = [
    similarGroupCount > 0 ? { icon: 'copy-outline' as const, title: '相似照片', value: `${similarGroupCount} 组`, onPress: () => router.push('/similar') } : null,
    stats.screenshots > 0 ? { icon: 'phone-portrait-outline' as const, title: '截图', value: `${stats.screenshots} 张`, onPress: () => router.push('/photos?category=screenshot') } : null,
    stats.reclaimableBytes > 0 ? { icon: 'trash-outline' as const, title: '可回收空间', value: formatBytes(stats.reclaimableBytes), onPress: () => router.push('/trash') } : null
  ].filter(Boolean) as Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; value: string; onPress: () => void }>;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <Screen tab header={<TopBar title="今天" subtitle={formatDate(Date.now())} right={<Pressable accessibilityRole="button" accessibilityLabel="每日整理目标" style={styles.goalButton} onPress={() => router.push('/settings')}><Ionicons name="options-outline" size={22} color={theme.text} /></Pressable>} />}>
      {!initialized ? (
        <GlassSurface style={[styles.emptyCard, { borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{loading ? '正在读取本地索引…' : '读取本地索引失败'}</Text>
          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
          {!loading ? <PrimaryButton label="重试" onPress={() => void initialize()} /> : null}
        </GlassSurface>
      ) : stats.total === 0 ? (
        <GlassSurface style={[styles.emptyCard, { borderColor: theme.border }]}>
          <Ionicons name="images-outline" size={28} color={theme.primary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{permission.granted ? '当前没有可整理的照片' : '从本地相册开始'}</Text>
          <Text style={[styles.emptyText, { color: theme.muted }]}>{permission.granted ? '已获得照片访问权限。重新扫描可检查新照片。' : '照片只在本机整理；移入图序回收站不会删除系统原图。'}</Text>
          <PrimaryButton label={emptyActionLabel} loading={indexing} onPress={emptyAction} />
          {permission.accessPrivileges === 'limited' ? <Pressable accessibilityRole="button" style={styles.managePermission} onPress={() => router.push('/profile')}><Text style={{ color: theme.primary }}>管理可访问照片</Text></Pressable> : null}
          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        </GlassSurface>
      ) : (
        <>
          {permission.accessPrivileges === 'limited' ? <Pressable accessibilityRole="button" accessibilityLabel="管理部分照片访问权限" onPress={() => router.push('/profile')}><GlassSurface style={[styles.permissionNotice, { borderColor: theme.border }]}><Ionicons name="lock-open-outline" size={21} color={theme.primary} /><Text style={[styles.noticeText, { color: theme.muted }]}>目前只能整理你选中的照片</Text><Ionicons name="chevron-forward" size={20} color={theme.tertiary} /></GlassSurface></Pressable> : null}
          {stats.analysisPending > 0 ? <View style={styles.analysisNotice}><Ionicons name="sparkles-outline" size={17} color={theme.primary} /><Text style={[styles.noticeText, { color: theme.muted }]}>正在完善 {stats.analysisPending} 张照片的本地分析</Text></View> : null}

          <InboxHero
            photo={activePhotos[0]}
            count={activeReviewSession ? activeReviewSession.items.length : stats.pending}
            complete={!activeReviewSession && stats.pending === 0}
            label={activeReviewSession ? `${sourceLabel} · 已处理 ${sessionDone} 张` : dailyReviewed >= reviewPreferences.dailyTarget ? '今天的整理目标已完成' : '从最近加入的照片开始'}
            actionLabel={activeReviewSession ? '继续本组' : stats.pending > 0 ? dailyReviewed >= reviewPreferences.dailyTarget ? '再整理一组' : '开始整理' : '打开图库'}
            onPress={() => router.push(stats.pending > 0 || activeReviewSession ? activeReviewSession ? '/review' : '/review?source=all' : '/photos')}
            theme={theme}
          />

          <View style={styles.progressBlock}>
            <View style={styles.progressHead}><Text style={[styles.progressTitle, { color: theme.text }]}>今日整理</Text><Text style={[styles.progressCount, { color: theme.muted }]}><Text style={{ color: theme.text, fontWeight: '700' }}>{dailyReviewed}</Text> / {reviewPreferences.dailyTarget} 张</Text></View>
            <View style={[styles.progressTrack, { backgroundColor: theme.fillSecondary }]}><View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${dailyProgress}%` }]} /></View>
          </View>

          <View style={styles.libraryMeta}><Text style={[styles.metaText, { color: theme.muted }]}>{formatBytes(stats.storageBytes)} 已索引</Text><Text style={[styles.metaDot, { color: theme.tertiary }]}>·</Text><Text style={[styles.metaText, { color: theme.muted }]}>{stats.trashed} 张在回收站</Text></View>

          {suggestions.length ? <>
            <SectionTitle title="顺手整理" action="清理中心" onAction={() => router.push('/cleanup')} />
            <View style={styles.shortcutRow}>{suggestions.map((item) => {
              const single = suggestions.length === 1;
              return <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`${item.title}，${item.value}`} style={({ pressed }) => [single ? styles.singleShortcut : styles.shortcut, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]} onPress={item.onPress}>
                <View style={[styles.shortcutIcon, single && styles.singleShortcutIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={item.icon} size={20} color={theme.primary} /></View>
                <View style={single && styles.singleShortcutCopy}>
                  <Text numberOfLines={1} style={[styles.shortcutTitle, single && styles.singleShortcutTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text numberOfLines={1} style={[styles.shortcutValue, single && styles.singleShortcutValue, { color: theme.muted }]}>{item.value}</Text>
                </View>
                {single ? <Ionicons name="chevron-forward" size={19} color={theme.tertiary} /> : null}
              </Pressable>;
            })}</View>
          </> : null}

          {activePhotos.length ? <>
            <SectionTitle title="最近加入" action="查看图库" onAction={() => router.push('/photos')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentStrip}>
              {activePhotos.slice(0, 8).map((photo, index) => <Pressable accessibilityRole="imagebutton" accessibilityLabel={`打开 ${formatDate(photo.createdAt)} 的照片`} key={photo.id} style={[styles.recentItem, index === 0 && styles.firstRecent]} onPress={() => router.push(`/photo/${photo.id}`)}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />
                <View style={styles.recentShade} />
                <Text style={styles.recentDate}>{shortDate(photo.createdAt)}</Text>
              </Pressable>)}
            </ScrollView>
          </> : null}
        </>
      )}
    </Screen>
  );
}

function InboxHero({ photo, count, complete, label, actionLabel, onPress, theme }: {
  photo?: PhotoRecord;
  count: number;
  complete: boolean;
  label: string;
  actionLabel: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}，${count} 张待整理`} onPress={onPress} style={({ pressed }) => [styles.hero, { backgroundColor: photo ? theme.fillSecondary : theme.text }, pressed && styles.pressed]}>
    {photo ? <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`hero-${photo.id}`} /> : null}
    <View style={styles.heroShade} />
    <View style={styles.heroTop}><View style={styles.localPill}><Ionicons name="lock-closed-outline" size={13} color="#fff" /><Text style={styles.localText}>仅在本机整理</Text></View><View style={styles.photoCount}><Text style={styles.photoCountNumber}>{count.toLocaleString()}</Text><Text style={styles.photoCountUnit}>{complete ? '已完成' : '待整理'}</Text></View></View>
    <View style={styles.heroBottom}><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>相册收件箱</Text><Text style={styles.heroTitle}>{complete ? '今天很清爽' : `${count.toLocaleString()} 张`}</Text><Text numberOfLines={1} style={styles.heroSubtitle}>{label}</Text></View><View style={styles.heroAction}><Text style={styles.heroActionText}>{actionLabel}</Text><Ionicons name="arrow-forward" size={17} color="#292723" /></View></View>
  </Pressable>;
}

function shortDate(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '日期未知';
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

const styles = StyleSheet.create({
  goalButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { marginTop: 6, padding: 20, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  emptyTitle: { ...typography.headline },
  emptyText: { ...typography.subheadline, marginBottom: 4 },
  error: { ...typography.footnote },
  managePermission: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 264, borderRadius: 22, overflow: 'hidden', justifyContent: 'space-between' },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(21, 18, 15, 0.18)' },
  heroTop: { padding: 15, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  localPill: { minHeight: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(22, 20, 17, 0.40)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  localText: { color: '#fff', ...typography.caption, fontWeight: '600' },
  photoCount: { minWidth: 54, minHeight: 54, paddingHorizontal: 8, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22, 20, 17, 0.40)' },
  photoCountNumber: { color: '#fff', fontSize: 18, lineHeight: 21, fontWeight: '700' },
  photoCountUnit: { color: 'rgba(255,255,255,.86)', fontSize: 10, lineHeight: 13, fontWeight: '500' },
  heroBottom: { minHeight: 110, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: 'rgba(21, 18, 15, 0.60)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: 'rgba(255,255,255,.76)', ...typography.caption, marginBottom: 2 },
  heroTitle: { color: '#fff', fontSize: 35, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  heroSubtitle: { color: 'rgba(255,255,255,.82)', ...typography.caption, marginTop: 2 },
  heroAction: { minHeight: 42, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFEFC', flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroActionText: { color: '#292723', ...typography.caption, fontWeight: '700' },
  progressBlock: { paddingHorizontal: 2, marginTop: 18 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTitle: { ...typography.footnote, fontWeight: '600' },
  progressCount: { ...typography.caption },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  libraryMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingTop: 11 },
  metaText: { ...typography.caption },
  metaDot: { ...typography.caption },
  shortcutRow: { flexDirection: 'row', gap: 9 },
  shortcut: { flex: 1, minWidth: 0, minHeight: 104, paddingHorizontal: 11, paddingVertical: 11, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  singleShortcut: { flex: 1, minHeight: 68, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  shortcutIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  singleShortcutIcon: { width: 38, height: 38, marginBottom: 0 },
  singleShortcutCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  shortcutTitle: { ...typography.caption, fontWeight: '700' },
  singleShortcutTitle: { ...typography.footnote, fontWeight: '700' },
  shortcutValue: { ...typography.caption, fontSize: 11, lineHeight: 15, marginTop: 2 },
  singleShortcutValue: { ...typography.footnote, marginTop: 0 },
  recentStrip: { gap: 9, paddingRight: 4, alignItems: 'flex-start' },
  recentItem: { width: 118, height: 146, borderRadius: 13, overflow: 'hidden', backgroundColor: '#D6D1C8', justifyContent: 'flex-end' },
  firstRecent: { width: 144, height: 176 },
  recentShade: { height: 48, backgroundColor: 'rgba(22, 20, 17, 0.38)' },
  recentDate: { position: 'absolute', left: 10, bottom: 9, color: '#fff', ...typography.caption, fontWeight: '700' },
  noticeText: { ...typography.footnote, flex: 1 },
  permissionNotice: { minHeight: 50, marginTop: 4, paddingHorizontal: 13, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 },
  analysisNotice: { minHeight: 38, marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 },
  pressed: { opacity: 0.78 }
});
