import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { useAppTheme, typography } from '@/constants/theme';
import { getAppSettings, setAppSetting, type AppSettingKey } from '@/db/database';
import { useAppStore } from '@/store/useAppStore';

export default function SettingsScreen() {
  const theme = useAppTheme();
  const reset = useAppStore((state) => state.reset);
  const [settings, setSettings] = useState({ localAI: true, autoClassify: true, searchIndex: true });
  useEffect(() => { void getAppSettings().then(setSettings); }, []);
  const updateSetting = (key: AppSettingKey) => (value: boolean) => { setSettings((current) => ({ ...current, [key]: value })); void setAppSetting(key, value).catch(() => { setSettings((current) => ({ ...current, [key]: !value })); Alert.alert('设置保存失败', '请稍后重试。'); }); };
  const resetData = () => Alert.alert('清空应用索引？', '只清空 Photo Inbox 自己的索引，不会删除系统照片。', [{ text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: () => void reset() }]);
  return <Screen><TopBar title="设置与隐私" subtitle="本地处理与索引选项" back /><SectionTitle title="智能功能" /><Setting title="本地分析" desc="启发式分类与评分，下次扫描生效" value={settings.localAI} onValueChange={updateSetting('localAI')} theme={theme} /><Setting title="自动分类" desc="扫描时生成截图、文档等分类" value={settings.autoClassify} onValueChange={updateSetting('autoClassify')} theme={theme} /><Setting title="搜索索引" desc="保存本地关键词用于快速查找" value={settings.searchIndex} onValueChange={updateSetting('searchIndex')} theme={theme} /><SectionTitle title="隐私与关于" /><View style={[styles.privacy, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.privacyTitle, { color: theme.text }]}>照片属于你</Text><Text style={[styles.privacyText, { color: theme.muted }]}>照片默认只在设备本地处理，Photo Inbox 不包含云端上传逻辑。</Text></View><View style={[styles.version, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.versionTitle, { color: theme.text }]}>版本</Text><Text style={[styles.versionText, { color: theme.muted }]}>1.0.0 · Expo SDK 57 · SQLite 本地索引</Text></View><Text accessibilityRole="button" onPress={resetData} style={[styles.reset, { color: theme.danger }]}>清空应用索引（不会删除系统照片）</Text></Screen>;
}

function Setting({ title, desc, value, onValueChange, theme }: { title: string; desc: string; value: boolean; onValueChange: (value: boolean) => void; theme: ReturnType<typeof useAppTheme> }) { return <View style={[styles.setting, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.desc, { color: theme.muted }]}>{desc}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} trackColor={{ false: theme.fillSecondary, true: theme.primarySoft }} thumbColor={value ? theme.primary : theme.tertiary} /></View>; }

const styles = StyleSheet.create({ setting: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, title: { ...typography.callout }, desc: { ...typography.footnote, marginTop: 3 }, privacy: { padding: 16, borderWidth: StyleSheet.hairlineWidth }, privacyTitle: { ...typography.callout }, privacyText: { ...typography.footnote, marginTop: 5 }, version: { marginTop: 10, padding: 16, borderWidth: StyleSheet.hairlineWidth }, versionTitle: { ...typography.callout }, versionText: { ...typography.footnote, marginTop: 5 }, reset: { minHeight: 44, textAlign: 'center', textAlignVertical: 'center', ...typography.footnote, fontWeight: '600' }
});
