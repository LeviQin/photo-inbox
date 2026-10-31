import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/EmptyState';
import { GlassSurface } from '@/components/GlassSurface';
import { Ionicons } from '@/components/GeneratedIcon';
import { useAppTheme, typography } from '@/constants/theme';
import { effectivePhotoBytes, findSimilarGroups, similarityProfiles } from '@/services/aiService';
import { useAppStore } from '@/store/useAppStore';
import { getSimilarityCandidates } from '@/db/database';
import { formatBytes, formatDate } from '@/utils/format';
import type { PhotoRecord, SimilarityLevel } from '@/types/photo';
import { confirmAction, showMessage } from '@/services/confirmation';
import { getAIConfig } from '@/services/aiConfig';
import { comparePhotosWithAI } from '@/services/aiFeatures';

const levelOptions: Array<{ value: SimilarityLevel; label: string }> = [
  { value: 'strict', label: '严格' },
  { value: 'balanced', label: '均衡' },
  { value: 'loose', label: '宽松' }
];

export default function SimilarScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const revision = useAppStore((state) => state.dataRevision);
  const preferences = useAppStore((state) => state.reviewPreferences);
  const setSimilarity = useAppStore((state) => state.setSimilarity);
  const changeManyStatus = useAppStore((state) => state.changeManyStatus);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string>>({});
  const [trashByGroup, setTrashByGroup] = useState<Record<string, string[]>>({});
  const [aiComparing, setAiComparing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const profile = similarityProfiles[preferences.similarityLevel];
    setLoading(true);
    setPhotos([]);
    setError(null);
    void getSimilarityCandidates({ timeWindowMs: profile.timeWindowMs, ratioTolerance: profile.ratioTolerance })
      .then((items) => { if (active) setPhotos(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '读取相似照片失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preferences.similarityLevel, revision]);

  const groups = useMemo(() => findSimilarGroups(photos, preferences.similarityLevel), [photos, preferences.similarityLevel]);
  const safeIndex = Math.min(groupIndex, Math.max(0, groups.length - 1));
  const group = groups[safeIndex];
  const selectedId = group ? selectedByGroup[group.id] ?? group.bestId : null;
  const selected = group?.items.find((photo) => photo.id === selectedId) ?? null;
  const trashIds = group ? trashByGroup[group.id] ?? [] : [];
  const removable = group?.items.filter((photo) => photo.id !== selectedId && trashIds.includes(photo.id)) ?? [];
  const reclaimable = removable.reduce((sum, photo) => sum + effectivePhotoBytes(photo), 0);
  const allMeasured = removable.every((photo) => photo.actualBytes !== null);
  const mainHeight = Math.min(430, Math.max(280, width * 0.94));

  const choose = (id: string) => {
    if (!group) return;
    setSelectedByGroup((current) => ({ ...current, [group.id]: id }));
    setTrashByGroup((current) => ({ ...current, [group.id]: (current[group.id] ?? []).filter((item) => item !== id) }));
  };
  const toggleTrash = (id: string) => {
    if (!group || id === selectedId) return;
    setTrashByGroup((current) => {
      const ids = current[group.id] ?? [];
      return { ...current, [group.id]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] };
    });
  };
  const chooseByTime = (latest: boolean) => {
    if (!group) return;
    const sorted = [...group.items].sort((a, b) => a.createdAt - b.createdAt);
    choose((latest ? sorted.at(-1) : sorted[0])!.id);
  };
  const applyCleanup = async () => {
    if (!removable.length || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await changeManyStatus(removable.map((photo) => photo.id), 'trashed');
    } catch (error) {
      showMessage('整理失败', error instanceof Error ? error.message : '无法移入回收站，请重试。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const confirmCleanup = () => {
    if (!group || !selected || !removable.length || savingRef.current) return;
    confirmAction(
      group.kind === 'exact' ? '整理精确重复照片？' : '整理视觉相似照片？',
      `将保留“${selected.filename}”，另外 ${removable.length} 张移入图序回收站。之后仍需在回收站确认，绝不会自动删除系统原图。`,
      '确认移入回收站',
      () => void applyCleanup(),
      true
    );
  };
  const compareWithAI = async () => {
    if (!group || aiComparing) return;
    if (group.items.length > 4) {
      showMessage('本组照片较多', 'AI 比较最多发送 4 张压缩图，请先手动选择至 4 张以内。');
      return;
    }
    try {
      const config = await getAIConfig();
      if (!config.apiKey.trim()) {
        Alert.alert('先配置 AI 服务', 'AI 比较需要支持图片输入的模型和 API Key。', [
          { text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => router.push('/settings/ai') }
        ]);
        return;
      }
      Alert.alert('发送本组照片比较？', `将本组 ${group.items.length} 张照片的压缩副本发送到 ${config.endpoint}，服务提供方可能收费。AI 只会提出保留建议，不会移入回收站。`, [
        { text: '取消', style: 'cancel' },
        { text: '确认比较', onPress: () => {
          setAiComparing(true);
          setAiSuggestions((current) => ({ ...current, [group.id]: '' }));
          void comparePhotosWithAI(config, group.items).then((result) => {
            const recommended = group.items[result.keepIndex];
            if (!recommended) throw new Error('AI 返回了无效的照片序号。');
            choose(recommended.id);
            const reason = result.reason ? `：${result.reason}` : '';
            setAiSuggestions((current) => ({ ...current, [group.id]: `AI 建议保留第 ${result.keepIndex + 1} 张${reason}` }));
          }).catch((error) => {
            showMessage('AI 比较失败', error instanceof Error ? error.message : '请稍后重试。');
          }).finally(() => setAiComparing(false));
        } }
      ]);
    } catch (error) {
      showMessage('读取 AI 配置失败', error instanceof Error ? error.message : '请稍后重试。');
    }
  };

  return <Screen scroll={false} contentStyle={styles.screen}><View style={styles.header}><TopBar title="相似照片" subtitle="推荐只是参考，每组都由你确认" back /></View>
    <View style={[styles.levelBar, { borderBottomColor: theme.border }]}>{levelOptions.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: preferences.similarityLevel === item.value }} onPress={() => { setGroupIndex(0); void setSimilarity(item.value); }} style={[styles.levelButton, preferences.similarityLevel === item.value && { backgroundColor: theme.primarySoft }]}><Text style={[styles.levelText, { color: preferences.similarityLevel === item.value ? theme.primary : theme.muted }]}>{item.label}</Text></Pressable>)}</View>
    {!group ? <View style={styles.emptyWrap}><EmptyState icon={loading ? 'scan-outline' : error ? 'alert-circle-outline' : 'checkmark-circle-outline'} title={loading ? '正在读取端侧分析结果' : error ? '读取相似照片失败' : '暂时没有相似照片'} description={loading ? '原图不会上传，也不会为了分析下载 iCloud 原件。' : error ?? '可以在设置中调整灵敏度，或重新扫描新照片。'} /></View> : <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.groupMeta}><View><Text style={[styles.groupTitle, { color: theme.text }]}>{group.kind === 'exact' ? '精确重复' : '视觉相似'} · {group.items.length} 张</Text><Text style={[styles.groupHint, { color: theme.muted }]}>第 {safeIndex + 1} / {groups.length} 组</Text></View><View style={styles.groupNav}><Pressable accessibilityRole="button" accessibilityLabel="上一组" disabled={safeIndex === 0} style={[styles.navButton, safeIndex === 0 && styles.disabled]} onPress={() => setGroupIndex((value) => Math.max(0, value - 1))}><Ionicons name="chevron-back" size={26} color={theme.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="下一组" disabled={safeIndex === groups.length - 1} style={[styles.navButton, safeIndex === groups.length - 1 && styles.disabled]} onPress={() => setGroupIndex((value) => Math.min(groups.length - 1, value + 1))}><Ionicons name="chevron-forward" size={26} color={theme.text} /></Pressable></View></View>
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={`打开 ${selected?.filename}`} onPress={() => selected && router.push(`/photo/${selected.id}`)} style={[styles.mainPhoto, { height: mainHeight, backgroundColor: theme.dark }]}><Image source={{ uri: selected?.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} /><View style={[StyleSheet.absoluteFill, styles.mainShade]} /><Image source={{ uri: selected?.uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" /><View style={[styles.recommendedBadge, { backgroundColor: selected?.id === group.bestId ? theme.success : theme.primary }]}><Text style={styles.badgeText}>{selected?.id === group.bestId ? '推荐保留' : '当前保留'}</Text></View></Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>{group.items.map((photo) => <Pressable key={photo.id} accessibilityRole="button" accessibilityState={{ selected: photo.id === selectedId }} onPress={() => choose(photo.id)} style={[styles.thumbnail, { borderColor: photo.id === selectedId ? theme.primary : 'transparent' }]}><Image source={{ uri: photo.uri }} style={styles.thumbnailImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />{photo.id === group.bestId ? <View style={[styles.thumbnailMark, { backgroundColor: theme.success }]}><Ionicons name="sparkles" size={12} color="#fff" /></View> : null}</Pressable>)}</ScrollView>
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>选择要保留的一张</Text><View style={styles.choiceRow}><Choice label="推荐" active={selectedId === group.bestId} onPress={() => choose(group.bestId)} theme={theme} /><Choice label="最早" active={selectedId === [...group.items].sort((a, b) => a.createdAt - b.createdAt)[0]!.id} onPress={() => chooseByTime(false)} theme={theme} /><Choice label="最新" active={selectedId === [...group.items].sort((a, b) => a.createdAt - b.createdAt).at(-1)!.id} onPress={() => chooseByTime(true)} theme={theme} /><Choice label="手动" active={!selectedId || (selectedId !== group.bestId && selectedId !== [...group.items].sort((a, b) => a.createdAt - b.createdAt)[0]!.id && selectedId !== [...group.items].sort((a, b) => a.createdAt - b.createdAt).at(-1)!.id)} onPress={() => Alert.alert('手动选择', '点击上方任意缩略图，即可将它设为本组保留项。')} theme={theme} /></View>
        <Pressable accessibilityRole="button" disabled={aiComparing || group.items.length > 4 || Platform.OS === 'web'} style={[styles.aiCompareButton, { backgroundColor: theme.primarySoft }, (aiComparing || group.items.length > 4 || Platform.OS === 'web') && styles.disabled]} onPress={() => void compareWithAI()}><Ionicons name="sparkles" size={18} color={theme.primary} /><Text style={[styles.aiCompareText, { color: theme.primary }]}>{aiComparing ? 'AI 正在比较…' : 'AI 比较画面并推荐保留项'}</Text></Pressable>
        {group.items.length > 4 ? <Text style={[styles.aiHint, { color: theme.muted }]}>AI 比较最多处理 4 张压缩图</Text> : null}
        {aiSuggestions[group.id] ? <Text style={[styles.aiHint, { color: theme.primary }]}>{aiSuggestions[group.id]} · 仍可手动调整</Text> : null}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>逐张选择要移入回收站的照片</Text>
        {group.items.filter((photo) => photo.id !== selectedId).map((photo) => <Pressable key={photo.id} accessibilityRole="checkbox" accessibilityState={{ checked: trashIds.includes(photo.id) }} aria-checked={trashIds.includes(photo.id)} accessibilityLabel={`移入回收站 ${photo.filename}`} onPress={() => toggleTrash(photo.id)} style={[styles.trashChoice, { borderColor: trashIds.includes(photo.id) ? theme.primary : theme.border, backgroundColor: trashIds.includes(photo.id) ? theme.primarySoft : theme.glass }]}><Image source={{ uri: photo.uri }} style={styles.trashPreview} contentFit="cover" /><Text numberOfLines={1} style={[styles.trashFilename, { color: theme.text }]}>{photo.filename}</Text><Ionicons name={trashIds.includes(photo.id) ? 'checkbox' : 'square-outline'} size={24} color={theme.primary} /></Pressable>)}
        {group.kind === 'exact' ? <Pressable accessibilityRole="button" accessibilityLabel="选中其余精确重复照片" onPress={() => setTrashByGroup((current) => ({ ...current, [group.id]: group.items.filter((photo) => photo.id !== selectedId).map((photo) => photo.id) }))} style={styles.selectExact}><Text style={{ color: theme.primary }}>选中其余精确重复照片</Text></Pressable> : null}
        {selected ? <GlassSurface intensity={28} style={[styles.infoCard, { borderColor: theme.border }]}><Text numberOfLines={1} style={[styles.infoName, { color: theme.text }]}>{selected.filename}</Text><Text style={[styles.infoText, { color: theme.muted }]}>{selected.width} × {selected.height} · {formatBytes(effectivePhotoBytes(selected))} · {formatDate(selected.createdAt)}</Text></GlassSurface> : null}
      </ScrollView>
      <GlassSurface intensity={48} style={[styles.bottomBar, { borderColor: theme.glassBorder }]}><View style={styles.bottomCopy}><Text style={[styles.bottomTitle, { color: theme.text }]}>已选择 {removable.length} 张</Text><Text style={[styles.bottomHint, { color: theme.muted }]}>{removable.length ? `所选照片 ${formatBytes(reclaimable)}${allMeasured ? ' · 真实大小' : ' · 含估算'}` : '相似照片需逐张确认'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={saving ? '正在整理这一组' : '确认整理这一组'} disabled={saving || !removable.length} style={[styles.cleanupButton, { backgroundColor: theme.primary }, (saving || !removable.length) && styles.disabled]} onPress={confirmCleanup}><Text style={styles.cleanupText}>{saving ? '处理中…' : '确认整理'}</Text></Pressable></GlassSurface>
    </>}
  </Screen>;
}

function Choice({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useAppTheme> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choice, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySoft : 'transparent' }]}><Text style={[styles.choiceText, { color: active ? theme.primary : theme.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingBottom: 0 }, header: { paddingHorizontal: 20 }, levelBar: { marginHorizontal: 20, padding: 4, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 5 }, levelButton: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, levelText: { ...typography.footnote, fontWeight: '700' }, emptyWrap: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 126 }, groupMeta: { minHeight: 46, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, groupTitle: { ...typography.callout }, groupHint: { ...typography.caption, marginTop: 2 }, groupNav: { flexDirection: 'row' }, navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.3 }, mainPhoto: { marginTop: 8, borderRadius: 22, overflow: 'hidden' }, mainShade: { backgroundColor: 'rgba(0,0,0,.24)' }, recommendedBadge: { position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 }, badgeText: { color: '#fff', ...typography.caption, fontWeight: '700' }, thumbnails: { gap: 8, paddingVertical: 11 }, thumbnail: { width: 72, height: 72, padding: 2, borderRadius: 13, borderWidth: 2 }, thumbnailImage: { flex: 1, borderRadius: 9 }, thumbnailMark: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, sectionLabel: { ...typography.caption, marginTop: 12, marginBottom: 7 }, choiceRow: { flexDirection: 'row', gap: 7 }, choice: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' }, choiceText: { ...typography.caption, fontWeight: '700' }, aiCompareButton: { minHeight: 46, marginTop: 10, paddingHorizontal: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, aiCompareText: { ...typography.footnote, fontWeight: '700' }, aiHint: { ...typography.caption, textAlign: 'center', marginTop: 7 }, trashChoice: { minHeight: 62, padding: 6, marginBottom: 6, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, trashPreview: { width: 48, height: 48, borderRadius: 7 }, trashFilename: { flex: 1, ...typography.footnote }, selectExact: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, infoCard: { marginTop: 10, padding: 13, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth }, infoName: { ...typography.footnote, fontWeight: '700' }, infoText: { ...typography.caption, marginTop: 3 }, bottomBar: { position: 'absolute', left: 14, right: 14, bottom: 10, minHeight: 80, paddingHorizontal: 15, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }, bottomCopy: { flex: 1 }, bottomTitle: { ...typography.callout }, bottomHint: { ...typography.caption, marginTop: 3 }, cleanupButton: { minHeight: 46, paddingHorizontal: 17, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, cleanupText: { color: '#fff', ...typography.footnote, fontWeight: '700' }
});
