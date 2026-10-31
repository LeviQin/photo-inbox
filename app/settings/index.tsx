import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { ReviewTarget, SimilarityLevel } from '@/types/photo';

export default function PreferencesScreen() {
  const theme = useAppTheme();
  const preferences = useAppStore((state) => state.reviewPreferences);
  const setDailyTarget = useAppStore((state) => state.setDailyTarget);
  const setSimilarity = useAppStore((state) => state.setSimilarity);
  return <Screen header={<TopBar title="整理偏好" subtitle="每日目标与相似照片" back />}>
    <GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>每日目标</Text>
      <Text style={[styles.desc, { color: theme.muted }]}>新建整理会话时使用，当前会话不会被截断。</Text>
      <View style={styles.optionRow}>{([10, 20, 30, 50] as ReviewTarget[]).map((target) => <Option key={target} label={`${target}`} selected={preferences.dailyTarget === target} onPress={() => void setDailyTarget(target)} theme={theme} />)}</View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Text style={[styles.title, { color: theme.text }]}>相似照片灵敏度</Text>
      <Text style={[styles.desc, { color: theme.muted }]}>严格更少误报，宽松更容易找到同一场景。</Text>
      <View style={styles.optionRow}>{([{ value: 'strict', label: '严格' }, { value: 'balanced', label: '均衡' }, { value: 'loose', label: '宽松' }] as Array<{ value: SimilarityLevel; label: string }>).map((item) => <Option key={item.value} label={item.label} selected={preferences.similarityLevel === item.value} onPress={() => void setSimilarity(item.value)} theme={theme} />)}</View>
    </GlassSurface>
  </Screen>;
}

function Option({ label, selected, onPress, theme }: { label: string; selected: boolean; onPress: () => void; theme: ReturnType<typeof useAppTheme> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : 'transparent' }]}><Text style={[styles.optionText, { color: selected ? theme.primary : theme.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  card: { marginTop: 8, padding: 15, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  optionRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  option: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  optionText: { ...typography.footnote, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  title: { ...typography.callout }, desc: { ...typography.footnote, marginTop: 4 }
});
