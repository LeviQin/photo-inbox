import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { GlassSurface } from '@/components/GlassSurface';
import { SectionTitle } from '@/components/SectionTitle';
import { useAppTheme, typography } from '@/constants/theme';
import { getAppSettings, getLastScanAt, getOcrStats, retryFailedPhotoOcr, setAppSetting } from '@/db/database';
import { isLocalOcrAvailable } from '@/services/localOcrService';
import { useAppStore } from '@/store/useAppStore';
import { formatDate } from '@/utils/format';

type OcrStats = Awaited<ReturnType<typeof getOcrStats>>;

export default function AnalysisScreen() {
  const theme = useAppTheme();
  const { stats, indexing, progress, error, scan, resumeAnalysis, dataRevision } = useAppStore();
  const [ocr, setOcr] = useState<OcrStats | null>(null);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([getOcrStats(), getLastScanAt(), getAppSettings()]).then(([nextOcr, nextScan, settings]) => {
      if (active) { setOcr(nextOcr); setLastScan(nextScan); setPaused(settings.localOcrPaused); }
    }).catch((cause) => { if (active) setActionError(cause instanceof Error ? cause.message : '读取进度失败'); });
    return () => { active = false; };
  }, [dataRevision]));

  const togglePaused = (value: boolean) => {
    setPaused(value);
    setActionError('');
    void setAppSetting('localOcrPaused', value).then(() => {
      if (!value) void resumeAnalysis();
    }).catch((cause) => {
      setPaused(!value);
      setActionError(cause instanceof Error ? cause.message : '保存设置失败');
    });
  };
  const retry = () => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    void retryFailedPhotoOcr().then(async () => {
      setOcr(await getOcrStats());
      if (!paused) await resumeAnalysis();
    }).catch((cause) => setActionError(cause instanceof Error ? cause.message : '重试失败'))
      .finally(() => setBusy(false));
  };

  return <Screen header={<TopBar title="分析状态" subtitle="了解本机处理进度" back />}>
    <SectionTitle title="相册扫描" />
    <GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>
      <Text style={[styles.value, { color: theme.text }]}>{indexing ? `已读取 ${progress} 张` : `${stats.total.toLocaleString()} 张已索引`}</Text>
      <Text style={[styles.detail, { color: theme.muted }]}>上次完成扫描：{lastScan ? formatDate(lastScan) : '暂无'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="重新扫描相册" disabled={indexing} onPress={() => void scan()} style={[styles.action, indexing && styles.disabled]}><Text style={{ color: theme.primary }}>{indexing ? '扫描中…' : '重新扫描'}</Text></Pressable>
      {error ? <Text style={[styles.detail, { color: theme.danger }]}>{error}</Text> : null}
    </GlassSurface>

    <SectionTitle title="基础分析" />
    <GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>
      <Text style={[styles.value, { color: theme.text }]}>{stats.analysisPending} 项待处理</Text>
      <Text style={[styles.detail, { color: theme.muted }]}>照片大小：{stats.measuredCount} / {stats.total} 张已测真实大小（{stats.sizeCoverage}%）</Text>
      <View style={[styles.track, { backgroundColor: theme.fillSecondary }]}><View style={[styles.fill, { backgroundColor: theme.primary, width: `${stats.sizeCoverage}%` }]} /></View>
      <Text style={[styles.detail, { color: theme.muted }]}>剩余大小使用估算值；相似候选会随着本机分析逐步更新。</Text>
    </GlassSurface>

    <SectionTitle title="截图与文档文字" />
    <GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>
      <Text style={[styles.value, { color: theme.text }]}>{ocr ? `${ocr.done} / ${ocr.total} 张已完成识别` : '正在读取…'}</Text>
      <Text style={[styles.detail, { color: theme.muted }]}>{ocr ? `${ocr.pending} 张等待识别 · ${ocr.failed} 张失败 · ${ocr.skipped} 张已跳过` : '队列保存在本机。'}</Text>
      <Text style={[styles.detail, { color: theme.muted }]}>{isLocalOcrAvailable() ? '本机识别无需账号或网络，识别结果仅保存在当前设备。' : '当前构建未包含本机文字识别；请安装新版 Android 或 iOS 应用。'}</Text>
      <View style={[styles.switchRow, { borderTopColor: theme.border }]}><Text style={[styles.switchLabel, { color: theme.text }]}>暂停自动识别</Text><Switch accessibilityLabel="暂停自动识别" disabled={!isLocalOcrAvailable()} value={paused} onValueChange={togglePaused} trackColor={{ false: theme.fillSecondary, true: theme.primary }} /></View>
      {ocr?.failed ? <Pressable accessibilityRole="button" accessibilityLabel="重试失败的文字识别" disabled={busy || !isLocalOcrAvailable()} onPress={retry} style={[styles.action, (busy || !isLocalOcrAvailable()) && styles.disabled]}><Text style={{ color: theme.primary }}>{busy ? '处理中…' : `重试 ${ocr.failed} 张`}</Text></Pressable> : null}
      {actionError ? <Text style={[styles.detail, { color: theme.danger }]}>{actionError}</Text> : null}
    </GlassSurface>
  </Screen>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  value: { ...typography.headline }, detail: { ...typography.footnote },
  action: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  switchRow: { minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { ...typography.callout }, track: { height: 7, borderRadius: 4, overflow: 'hidden' }, fill: { height: 7, borderRadius: 4 }, disabled: { opacity: 0.5 }
});
