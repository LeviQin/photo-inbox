import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@/components/GeneratedIcon';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { SectionTitle } from '@/components/SectionTitle';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { APP_VERSION } from '@/constants/app';
import { useAppStore } from '@/store/useAppStore';
import { getAppSettings, setAppSetting, type AppSettingKey, type AppearanceMode } from '@/db/database';
import { formatBytes } from '@/utils/format';
import { chooseMorePhotos, openPhotoPermissionSettings, requestPhotoPermission } from '@/services/photoPermissionService';

export default function SettingsTab() {
  const router = useRouter();
  const theme = useAppTheme();
  const appearanceMode = useAppStore((state) => state.appearanceMode);
  const setAppearanceMode = useAppStore((state) => state.setAppearanceMode);
  const { stats, indexing, scan, reset, useDemo, demoMode, permission, refreshPermission } = useAppStore();
  const [settings, setSettings] = useState({ localAI: true, autoClassify: true, searchIndex: true });

  useEffect(() => { void getAppSettings().then(setSettings); }, []);

  const updateSetting = (key: AppSettingKey) => (value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void setAppSetting(key, value).catch(() => {
      setSettings((current) => ({ ...current, [key]: !value }));
      Alert.alert('设置保存失败', '请稍后重试。');
    });
  };
  const resetData = () => Alert.alert('清空应用索引？', '只清空图序自己的索引，不会删除系统照片。', [
    { text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: () => void reset() }
  ]);
  const accessValue = permission.accessPrivileges === 'limited' ? '仅部分照片' : permission.granted ? '全部照片' : '未授权';
  const changeAppearance = (mode: AppearanceMode) => {
    void setAppearanceMode(mode).catch(() => Alert.alert('外观设置保存失败', '请稍后重试。'));
  };
  const managePhotoAccess = async () => {
    try {
      if (permission.accessPrivileges === 'limited') {
        await chooseMorePhotos();
        await refreshPermission();
        await scan();
      } else if (!permission.granted && !permission.canAskAgain) {
        await openPhotoPermissionSettings();
      } else if (!permission.granted) {
        const nextPermission = await requestPhotoPermission();
        await refreshPermission();
        if (nextPermission.granted) await scan();
      }
    } catch (error) {
      Alert.alert('无法管理照片权限', error instanceof Error ? error.message : '请前往系统设置修改照片权限。');
    }
  };

  return (
    <Screen tab header={<TopBar title="设置" subtitle={demoMode ? '当前使用演示数据' : '本地照片管家'} />}>
      <SectionTitle title="照片访问" />
      <GlassSurface intensity={30} style={[styles.group, { borderColor: theme.border }]}>
        <SettingsRow icon="images-outline" title="照片权限" value={accessValue} theme={theme} onPress={permission.granted && permission.accessPrivileges === 'all' ? undefined : () => void managePhotoAccess()} />
        <SettingsRow icon="albums-outline" title="相册索引" value={stats.total ? `${stats.total.toLocaleString()} 张已索引` : '尚未扫描'} theme={theme} />
        <SettingsRow icon="scan-outline" title={indexing ? '正在扫描相册…' : '重新扫描'} value="本地处理" theme={theme} onPress={() => void scan()} />
        <SettingsRow icon="analytics-outline" title="分析状态" value="查看进度" theme={theme} onPress={() => router.push('/analysis')} last />
      </GlassSurface>

      <SectionTitle title="照片管理" />
      <GlassSurface intensity={30} style={[styles.group, { borderColor: theme.border }]}>
        <SettingsRow icon="trash-bin-outline" title="回收站" value={`${stats.trashed} 张 · ${formatBytes(stats.reclaimableBytes)}`} theme={theme} onPress={() => router.push('/trash')} />
        <SettingsRow icon="server-outline" title="本地索引" value={`${stats.active.toLocaleString()} 张可用`} theme={theme} last />
      </GlassSurface>

      <SectionTitle title="智能功能" />
      <GlassSurface intensity={30} style={[styles.group, { borderColor: theme.border }]}>
        <Setting title="本地基础分析" desc="生成规则分类、基础估分与视觉指纹，下次扫描生效" value={settings.localAI} onValueChange={updateSetting('localAI')} theme={theme} />
        <Setting title="本地自动分类" desc="扫描时在本机按文件名和图片比例归类，不发送照片" value={settings.autoClassify} onValueChange={updateSetting('autoClassify')} theme={theme} />
        <Setting title="搜索索引" desc="保存本地关键词用于快速查找" value={settings.searchIndex} onValueChange={updateSetting('searchIndex')} theme={theme} />
        <SettingsRow icon="sparkles-outline" title="AI 智能服务" value="按需调用" theme={theme} onPress={() => router.push('/settings/ai')} last />
      </GlassSurface>

      <SectionTitle title="偏好与隐私" />
      <GlassSurface intensity={30} style={[styles.group, { borderColor: theme.border }]}>
        <AppearanceSetting mode={appearanceMode} onChange={changeAppearance} theme={theme} />
        <SettingsRow icon="options-outline" title="每日目标与相似度" value="调整" theme={theme} onPress={() => router.push('/settings')} />
        <SettingsRow icon="shield-checkmark-outline" title="隐私说明" value="查看" theme={theme} onPress={() => router.push('/privacy')} last />
      </GlassSurface>
      <Text style={[styles.versionText, { color: theme.tertiary }]}>图序 {APP_VERSION} · Expo SDK 57</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="清空应用索引" style={styles.dangerRow} onPress={resetData}><Text style={[styles.dangerText, { color: theme.danger }]}>清空应用索引</Text><Ionicons name="trash-outline" size={22} color={theme.danger} /></Pressable>
      {__DEV__ ? <Pressable accessibilityRole="button" accessibilityLabel="重新生成演示数据" style={styles.devButton} onPress={() => void useDemo()}><Text style={[styles.devText, { color: theme.muted }]}>开发：重新生成演示数据</Text></Pressable> : null}
    </Screen>
  );
}

function SettingsRow({ icon, title, value, theme, onPress, last = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; theme: ReturnType<typeof useAppTheme>; onPress?: () => void; last?: boolean }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${title}，${value}`} disabled={!onPress} style={[styles.row, { borderBottomColor: theme.border }, last && styles.lastRow]} onPress={onPress}><Ionicons name={icon} size={21} color={theme.muted} /><Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.rowValue, { color: theme.muted }]}>{value}</Text>{onPress ? <Ionicons name="chevron-forward" size={20} color={theme.tertiary} /> : null}</Pressable>;
}

function Setting({ title, desc, value, onValueChange, theme, last = false }: { title: string; desc: string; value: boolean; onValueChange: (value: boolean) => void; theme: ReturnType<typeof useAppTheme>; last?: boolean }) {
  return <View style={[styles.setting, { borderBottomColor: theme.border }, last && styles.lastRow]}><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.settingDesc, { color: theme.muted }]}>{desc}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} trackColor={{ false: theme.fillSecondary, true: theme.success }} thumbColor={value ? '#FFFFFF' : theme.tertiary} /></View>;
}

function AppearanceSetting({ mode, onChange, theme }: { mode: AppearanceMode; onChange: (mode: AppearanceMode) => void; theme: ReturnType<typeof useAppTheme> }) {
  const options: Array<{ value: AppearanceMode; label: string }> = [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色模式' },
    { value: 'dark', label: '深色模式' }
  ];

  return (
    <View style={[styles.appearance, { borderBottomColor: theme.border }]}>
      <Text style={[styles.settingTitle, { color: theme.text }]}>外观模式</Text>
      <Text style={[styles.settingDesc, { color: theme.muted }]}>选择图序的显示方式</Text>
      <View style={[styles.appearanceOptions, { backgroundColor: theme.fillSecondary }]}>
        {options.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.appearanceOption, selected && { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.appearanceOptionText, { color: selected ? theme.primary : theme.muted }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { ...typography.callout, flex: 1 },
  rowValue: { ...typography.footnote, maxWidth: '45%', textAlign: 'right' },
  setting: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  appearance: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  appearanceOptions: { flexDirection: 'row', gap: 3, padding: 4, marginTop: 11, borderRadius: 12 },
  appearanceOption: { flex: 1, minHeight: 39, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  appearanceOptionText: { ...typography.caption, fontWeight: '600' },
  settingTitle: { ...typography.callout },
  settingDesc: { ...typography.footnote, marginTop: 3 },
  privacy: { minHeight: 60, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyText: { ...typography.footnote, flex: 1 },
  versionText: { ...typography.caption, textAlign: 'center', paddingVertical: 18 },
  dangerRow: { minHeight: 44, marginHorizontal: 4, marginBottom: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dangerText: { ...typography.footnote, fontWeight: '600' },
  devButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  devText: { ...typography.caption },
  lastRow: { borderBottomWidth: 0 }
});
