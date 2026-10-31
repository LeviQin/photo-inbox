import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@/components/GeneratedIcon';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { getCleanupTaskCounts, getSimilarityCandidates } from '@/db/database';
import { findSimilarGroups, similarityProfiles } from '@/services/aiService';
import { formatBytes } from '@/utils/format';

type TaskCounts = Awaited<ReturnType<typeof getCleanupTaskCounts>> & { similarGroups: number; exactGroups: number };

export default function CleanupScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const stats = useAppStore((state) => state.stats);
  const revision = useAppStore((state) => state.dataRevision);
  const level = useAppStore((state) => state.reviewPreferences.similarityLevel);
  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const profile = similarityProfiles[level];
    setCounts(null);
    setError('');
    void Promise.all([
      getCleanupTaskCounts(),
      getSimilarityCandidates({ timeWindowMs: profile.timeWindowMs, ratioTolerance: profile.ratioTolerance })
    ]).then(([tasks, candidates]) => {
      if (!active) return;
      const groups = findSimilarGroups(candidates, level);
      setCounts({ ...tasks, similarGroups: groups.length, exactGroups: groups.filter((group) => group.kind === 'exact').length });
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '读取建议失败'); });
    return () => { active = false; };
  }, [level, revision]);

  const items = [
    counts?.similarGroups ? { icon: 'copy-outline' as const, title: '重复与相似照片', desc: `${counts.similarGroups} 组候选，含 ${counts.exactGroups} 组原文件重复 · 逐组确认`, onPress: () => router.push('/similar') } : null,
    counts?.oldScreenshots ? { icon: 'phone-portrait-outline' as const, title: '90 天前的截图', desc: `${counts.oldScreenshots} 张 · 按日期批量整理`, onPress: () => router.push(`/photos?category=screenshot&before=${Date.now() - 90 * 86_400_000}`) } : null,
    counts?.largeFiles ? { icon: 'images-outline' as const, title: '大文件', desc: `${counts.largeFiles} 张超过 10 MB · ${counts.largeMeasured} 张已测真实大小，其余为估算`, onPress: () => router.push('/search?q=大文件') } : null,
    stats.trashed ? { icon: 'trash-bin-outline' as const, title: '回收站', desc: `${stats.trashed} 张等待处理`, onPress: () => router.push('/trash') } : null
  ].filter(Boolean) as Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; onPress: () => void }>;

  return <Screen header={<TopBar title="清理中心" subtitle="按真实候选生成建议，由你决定去留" back />}>
    <GlassSurface intensity={32} style={[styles.hero, { borderColor: theme.border }]}>
      <Text style={[styles.heroLabel, { color: theme.muted }]}>回收站照片大小 · 部分可能为估算</Text>
      <Text style={[styles.heroValue, { color: theme.text }]}>{formatBytes(stats.reclaimableBytes)}</Text>
      <Text style={[styles.heroHint, { color: theme.muted }]}>移入图序回收站不会释放空间；永久删除后的空间变化以系统相册为准。</Text>
    </GlassSurface>
    {items.length ? <GlassSurface intensity={30} style={[styles.items, { borderColor: theme.border }]}>{items.map((item, index) => <CleanupItem key={item.title} {...item} theme={theme} last={index === items.length - 1} />)}</GlassSurface>
      : <GlassSurface intensity={30} style={[styles.empty, { borderColor: theme.border }]}><Ionicons name={error ? 'alert-circle-outline' : counts ? 'checkmark-circle-outline' : 'hourglass-outline'} size={34} color={error ? theme.danger : theme.success} /><Text style={[styles.emptyText, { color: theme.muted }]}>{error || (counts ? '暂无建议' : '正在检查照片…')}</Text></GlassSurface>}
    <View style={[styles.note, { borderTopColor: theme.border }]}><Ionicons name="shield-checkmark-outline" size={26} color={theme.success} /><Text style={[styles.noteText, { color: theme.muted }]}>不会自动删除照片。永久删除始终需要用户主动确认。</Text></View>
  </Screen>;
}

function CleanupItem({ icon, title, desc, onPress, theme, last }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; onPress: () => void; theme: ReturnType<typeof useAppTheme>; last: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${desc}`} style={[styles.item, { borderBottomColor: theme.border }, last && styles.lastRow]} onPress={onPress}><Ionicons name={icon} size={29} color={theme.primary} /><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.desc, { color: theme.muted }]}>{desc}</Text></View><Ionicons name="chevron-forward" size={23} color={theme.tertiary} /></Pressable>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth }, heroLabel: { ...typography.footnote }, heroValue: { fontSize: 36, lineHeight: 42, fontWeight: '700', marginTop: 5 }, heroHint: { ...typography.footnote, marginTop: 8 },
  items: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth }, item: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth }, title: { ...typography.callout }, desc: { ...typography.footnote, marginTop: 3 },
  empty: { minHeight: 94, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 6 }, emptyText: { ...typography.subheadline }, note: { marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8 }, noteText: { ...typography.footnote, flex: 1 }, lastRow: { borderBottomWidth: 0 }
});
