import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { getAppSettings, setAppSetting, type AppSettingKey } from '@/db/database';
import { formatBytes } from '@/utils/format';

export default function SettingsTab() {
  const router = useRouter();
  const theme = useAppTheme();
  const { stats, indexing, scan, reset, useDemo, demoMode } = useAppStore();
  const [settings, setSettings] = useState({ localAI: true, autoClassify: true, searchIndex: true });

  useEffect(() => { void getAppSettings().then(setSettings); }, []);

  const updateSetting = (key: AppSettingKey) => (value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void setAppSetting(key, value).catch(() => {
      setSettings((current) => ({ ...current, [key]: !value }));
      Alert.alert('设置保存失败', '请稍后重试。');
    });
  };
  const resetData = () => Alert.alert('清空应用索引？', '只清空 Photo Inbox 自己的索引，不会删除系统照片。', [
    { text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: () => void reset() }
  ]);

  return (
    <Screen>
      <TopBar title="设置" subtitle={demoMode ? '当前使用演示数据' : '本地照片管家'} />
      <SectionTitle title="照片访问" />
      <SettingsRow icon="images-outline" title="相册索引" value={stats.total ? `${stats.total.toLocaleString()} 张已索引` : '尚未授权或扫描'} theme={theme} />
      <SettingsRow icon="scan-outline" title={indexing ? '正在扫描相册…' : '重新扫描'} value="本地处理" theme={theme} onPress={() => void scan()} />

      <SectionTitle title="照片管理" />
      <SettingsRow icon="trash-bin-outline" title="回收站" value={`${stats.trashed} 张 · ${formatBytes(stats.reclaimableBytes)}`} theme={theme} onPress={() => router.push('/trash')} />
      <SettingsRow icon="server-outline" title="本地索引" value={`${stats.active.toLocaleString()} 张可用`} theme={theme} />

      <SectionTitle title="智能功能" />
      <Setting title="本地分析" desc="启发式分类与评分，下次扫描生效" value={settings.localAI} onValueChange={updateSetting('localAI')} theme={theme} />
      <Setting title="自动分类" desc="扫描时生成截图、文档等分类" value={settings.autoClassify} onValueChange={updateSetting('autoClassify')} theme={theme} />
      <Setting title="搜索索引" desc="保存本地关键词用于快速查找" value={settings.searchIndex} onValueChange={updateSetting('searchIndex')} theme={theme} />

      <SectionTitle title="隐私与关于" />
      <View style={[styles.privacy, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="shield-checkmark-outline" size={20} color={theme.success} /><Text style={[styles.privacyText, { color: theme.muted }]}>照片默认只在设备本地处理，Photo Inbox 不包含云端上传逻辑。</Text></View>
      <SettingsRow icon="information-circle-outline" title="版本" value="1.0.0 · Expo SDK 57" theme={theme} />
      <Pressable accessibilityRole="button" accessibilityLabel="清空应用索引" style={[styles.dangerRow, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={resetData}><Text style={[styles.dangerText, { color: theme.danger }]}>清空应用索引</Text><Ionicons name="trash-outline" size={19} color={theme.danger} /></Pressable>
      {__DEV__ ? <Pressable accessibilityRole="button" accessibilityLabel="重新生成演示数据" style={styles.devButton} onPress={() => void useDemo()}><Text style={[styles.devText, { color: theme.muted }]}>开发：重新生成演示数据</Text></Pressable> : null}
    </Screen>
  );
}

function SettingsRow({ icon, title, value, theme, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; theme: ReturnType<typeof useAppTheme>; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${title}，${value}`} disabled={!onPress} style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.border }]} onPress={onPress}><View style={[styles.icon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} size={19} color={theme.primary} /></View><Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.rowValue, { color: theme.muted }]}>{value}</Text>{onPress ? <Ionicons name="chevron-forward" size={18} color={theme.tertiary} /> : null}</Pressable>;
}

function Setting({ title, desc, value, onValueChange, theme }: { title: string; desc: string; value: boolean; onValueChange: (value: boolean) => void; theme: ReturnType<typeof useAppTheme> }) {
  return <View style={[styles.setting, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.settingDesc, { color: theme.muted }]}>{desc}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} trackColor={{ false: theme.fillSecondary, true: theme.primarySoft }} thumbColor={value ? theme.primary : theme.tertiary} /></View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...typography.callout, flex: 1 },
  rowValue: { ...typography.footnote, maxWidth: '45%', textAlign: 'right' },
  setting: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  settingTitle: { ...typography.callout },
  settingDesc: { ...typography.footnote, marginTop: 3 },
  privacy: { minHeight: 60, padding: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyText: { ...typography.footnote, flex: 1 },
  dangerRow: { minHeight: 56, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dangerText: { ...typography.callout },
  devButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  devText: { ...typography.caption }
});
