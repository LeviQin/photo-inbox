import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { findSimilarGroups } from '@/services/aiService';
import { formatBytes } from '@/utils/format';

export default function CleanupScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { photos, stats } = useAppStore();
  const active = photos.filter((photo) => photo.status === 'active');
  const similar = findSimilarGroups(active);
  const estimatedSimilarBytes = similar.reduce((sum, group) => sum + group.items.slice(1).reduce((s, item) => s + item.estimatedBytes, 0), 0);
  const items = [
    similar.length ? { icon: 'copy-outline' as const, title: '相似照片', desc: `${similar.length} 组 · 估算可减少 ${formatBytes(estimatedSimilarBytes)}`, onPress: () => router.push('/similar') } : null,
    stats.screenshots ? { icon: 'phone-portrait-outline' as const, title: '截图', desc: `${stats.screenshots} 张 · 按时间快速整理`, onPress: () => router.push('/photos?category=screenshot') } : null,
    stats.trashed ? { icon: 'trash-bin-outline' as const, title: '回收站', desc: `${stats.trashed} 张等待处理`, onPress: () => router.push('/trash') } : null
  ].filter(Boolean) as Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; onPress: () => void }>;

  return <Screen><TopBar title="清理中心" subtitle="AI 只给建议，最终由你确认" back /><View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.heroLabel, { color: theme.muted }]}>回收站可释放空间（估算）</Text><Text style={[styles.heroValue, { color: theme.text }]}>{formatBytes(stats.reclaimableBytes)}</Text><Text style={[styles.heroHint, { color: theme.muted }]}>永久删除后，系统空间才会真正释放。</Text></View>{items.length ? items.map((item) => <CleanupItem key={item.title} {...item} theme={theme} />) : <View style={[styles.empty, { backgroundColor: theme.surface }]}><Ionicons name="checkmark-circle-outline" size={24} color={theme.success} /><Text style={[styles.emptyText, { color: theme.muted }]}>暂无建议</Text></View>}<View style={[styles.note, { borderTopColor: theme.border }]}><Ionicons name="shield-checkmark-outline" size={20} color={theme.success} /><Text style={[styles.noteText, { color: theme.muted }]}>不会自动删除照片。永久删除始终需要用户主动确认。</Text></View></Screen>;
}

function CleanupItem({ icon, title, desc, onPress, theme }: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; onPress: () => void; theme: ReturnType<typeof useAppTheme> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${desc}`} style={[styles.item, { backgroundColor: theme.surface, borderBottomColor: theme.border }]} onPress={onPress}><View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} size={21} color={theme.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.desc, { color: theme.muted }]}>{desc}</Text></View><Ionicons name="chevron-forward" size={18} color={theme.tertiary} /></Pressable>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 20, marginBottom: 18, borderWidth: StyleSheet.hairlineWidth }, heroLabel: { ...typography.footnote }, heroValue: { fontSize: 36, lineHeight: 42, fontWeight: '700', marginTop: 5 }, heroHint: { ...typography.footnote, marginTop: 10 },
  item: { minHeight: 72, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, title: { ...typography.callout }, desc: { ...typography.footnote, marginTop: 4 },
  empty: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyText: { ...typography.subheadline }, note: { marginTop: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 }, noteText: { ...typography.footnote, flex: 1 }
});
