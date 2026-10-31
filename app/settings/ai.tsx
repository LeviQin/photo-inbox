import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { clearAIConfig, getAIConfig, saveAIConfig, type AIConfig } from '@/services/aiConfig';
import { aiEndpoint, testAIConnection } from '@/services/aiApi';

export default function AISettingsScreen() {
  const theme = useAppTheme();
  const [config, setConfig] = useState<AIConfig>({ endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: '' });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  useEffect(() => { void getAIConfig().then(setConfig).catch((error) => { setMessage(error instanceof Error ? error.message : '读取配置失败'); setMessageIsError(true); }); }, []);
  const update = (key: keyof AIConfig) => (value: string) => { setConfig((current) => ({ ...current, [key]: value })); setMessage(''); };
  const save = async () => {
    setSaving(true);
    try {
      aiEndpoint(config.endpoint);
      if (!config.model.trim() || !config.apiKey.trim()) throw new Error('请填写模型名称和 API Key。');
      await saveAIConfig(config);
      setMessage('配置已保存在设备安全存储中。');
      setMessageIsError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
      setMessageIsError(true);
    } finally { setSaving(false); }
  };
  const testConnection = async () => {
    setTesting(true);
    setMessage('正在测试连接…');
    setMessageIsError(false);
    try {
      aiEndpoint(config.endpoint);
      await testAIConnection(config);
      setMessage('文字连接测试成功。它只确认接口和密钥可用，不代表模型支持图片输入。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '连接失败');
      setMessageIsError(true);
    } finally { setTesting(false); }
  };
  const clear = () => Alert.alert('清除 AI 配置？', '只会清除接口地址、模型和 API Key，已识别的本地文字仍保留。', [
    { text: '取消', style: 'cancel' },
    { text: '清除', style: 'destructive', onPress: () => { void clearAIConfig().then(() => getAIConfig().then(setConfig)).then(() => { setMessage('AI 配置已清除。'); setMessageIsError(false); }).catch((error) => { setMessage(error instanceof Error ? error.message : '清除失败'); setMessageIsError(true); }); } }
  ]);
  return <Screen header={<TopBar title="AI 智能服务" subtitle="OCR · 图片理解 · 搜索 · 相似比较" back />}>
    <GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>
      <Text style={[styles.heading, { color: theme.text }]}>统一服务配置</Text>
      <Text style={[styles.help, { color: theme.muted }]}>所有 AI 功能共用这组 Chat Completions 配置。图片识字、理解和比较要求模型支持视觉输入；搜索扩展和连接测试只发送文字。</Text>
      <Field label="接口地址" value={config.endpoint} onChangeText={update('endpoint')} placeholder="https://api.deepseek.com" theme={theme} autoCapitalize="none" />
      <Field label="模型名称" value={config.model} onChangeText={update('model')} placeholder="deepseek-flash" theme={theme} autoCapitalize="none" />
      <Text style={[styles.help, { color: theme.muted }]}>DeepSeek 官方当前视觉模型名为 deepseek-flash（V4.1-Flash）；其他服务请填写其支持图片输入的模型名。</Text>
      <View><Text style={[styles.label, { color: theme.text }]}>API Key</Text><View style={styles.keyRow}><TextInput accessibilityLabel="AI API Key" value={config.apiKey} onChangeText={update('apiKey')} placeholder="输入你的 API Key" placeholderTextColor={theme.tertiary} secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} style={[styles.input, styles.keyInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.fillSecondary }]} /><Pressable accessibilityRole="button" accessibilityLabel={showKey ? '隐藏密钥' : '显示密钥'} style={styles.showButton} onPress={() => setShowKey((value) => !value)}><Text style={{ color: theme.primary }}>{showKey ? '隐藏' : '显示'}</Text></Pressable></View></View>
      {message ? <Text style={[styles.message, { color: messageIsError ? theme.danger : theme.primary }]}>{message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving || testing || Platform.OS === 'web'} onPress={() => void save()} style={[styles.save, { backgroundColor: theme.primary }, (saving || testing || Platform.OS === 'web') && styles.disabled]}><Text style={styles.saveText}>{saving ? '保存中…' : '保存配置'}</Text></Pressable>
      {Platform.OS !== 'web' ? <Pressable accessibilityRole="button" disabled={testing || saving} onPress={() => void testConnection()} style={[styles.test, { borderColor: theme.border }, (testing || saving) && styles.disabled]}><Text style={[styles.testText, { color: theme.primary }]}>{testing ? '正在测试…' : '测试连接'}</Text></Pressable> : null}
      {Platform.OS !== 'web' ? <Pressable accessibilityRole="button" onPress={clear} style={styles.clear}><Text style={{ color: theme.danger }}>清除配置</Text></Pressable> : <Text style={[styles.help, { color: theme.muted }]}>浏览器预览不保存 API Key；请在 Android 或 iOS 应用中配置。</Text>}
    </GlassSurface>
    <Text style={[styles.privacy, { color: theme.muted }]}>照片理解、识字和相似比较均在每次操作前单独确认，只发送压缩图；自然语言搜索和连接测试仅发送文字。AI 服务可能收费并按其条款处理请求，API Key 保存在设备安全存储中。</Text>
  </Screen>;
}

function Field({ label, value, onChangeText, placeholder, theme, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; theme: ReturnType<typeof useAppTheme>; autoCapitalize: 'none' }) {
  return <View><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.tertiary} autoCapitalize={autoCapitalize} autoCorrect={false} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.fillSecondary }]} /></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 8, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, gap: 15 },
  heading: { ...typography.headline }, help: { ...typography.footnote, lineHeight: 20 },
  label: { ...typography.footnote, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, ...typography.subheadline },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, keyInput: { flex: 1 }, showButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  message: { ...typography.footnote, lineHeight: 21 }, save: { minHeight: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#fff', ...typography.callout, fontWeight: '700' }, test: { minHeight: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, testText: { ...typography.callout }, disabled: { opacity: 0.45 }, clear: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, privacy: { ...typography.footnote, lineHeight: 21, marginTop: 15 }
});
