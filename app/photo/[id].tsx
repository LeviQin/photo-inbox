import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@/components/GeneratedIcon';
import { GlassSurface } from '@/components/GlassSurface';
import { AmbientBackground } from '@/components/AmbientBackground';
import { useAppTheme, typography } from '@/constants/theme';
import { clearPhotoOcrText, getPhoto, getPhotoAiDescription, getPhotoOcrText, savePhotoAiDescription, savePhotoOcrText, setPhotoCategory, toggleFavorite } from '@/db/database';
import { useAppStore } from '@/store/useAppStore';
import { formatBytes, formatDate } from '@/utils/format';
import type { AIPhotoInsight } from '@/services/aiService';
import type { PhotoRecord } from '@/types/photo';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { getAIConfig } from '@/services/aiConfig';
import { analyzePhotoWithAI } from '@/services/aiFeatures';
import { recognizePhotoText } from '@/services/visionOcrService';
import { recognizePhotoTextLocally, isLocalOcrAvailable } from '@/services/localOcrService';
import { confirmAction, showMessage } from '@/services/confirmation';

const categoryNames: Record<string, string> = { screenshot: '截图', document: '文档', travel: '旅行', food: '美食', pet: '宠物', portrait: '人物', other: '其他' };

export default function PhotoDetailScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photo, setPhoto] = useState<PhotoRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [aiDescription, setAiDescription] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrNotice, setOcrNotice] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIPhotoInsight | null>(null);
  const [savingAiCategory, setSavingAiCategory] = useState(false);
  const [aiCategoryApplied, setAiCategoryApplied] = useState(false);
  const mutationLocked = useRef(false);
  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'android') NavigationBar.setStyle('dark');
    return () => {
      if (Platform.OS === 'android') NavigationBar.setStyle(scheme === 'dark' ? 'dark' : 'light');
    };
  }, [scheme]));
  const refresh = useAppStore((state) => state.refresh);
  const changeStatus = useAppStore((state) => state.changeStatus);
  const restorePhotos = useAppStore((state) => state.restorePhotos);
  const panelHeight = Math.min(480, Math.max(390, height * 0.56));
  const collapsedOffset = panelHeight - 150 - insets.bottom;
  const translateY = useRef(new Animated.Value(collapsedOffset)).current;
  const offsetRef = useRef(collapsedOffset);
  const nativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    offsetRef.current = collapsedOffset;
    translateY.setValue(collapsedOffset);
  }, [collapsedOffset, translateY]);

  const panelResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => translateY.stopAnimation((value) => { offsetRef.current = value; }),
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
        translateY.setValue(Math.max(0, Math.min(collapsedOffset, offsetRef.current + gesture.dy)));
      }
    },
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dy) < 6) {
        const target = offsetRef.current > 0 ? 0 : collapsedOffset;
        offsetRef.current = target;
        if (reduceMotion) translateY.setValue(target);
        else Animated.spring(translateY, { toValue: target, useNativeDriver: nativeDriver, damping: 22, stiffness: 220 }).start();
        return;
      }
      const expand = gesture.vy < -0.35 || offsetRef.current + gesture.dy < collapsedOffset * 0.55;
      const target = expand ? 0 : collapsedOffset;
      offsetRef.current = target;
      if (reduceMotion) translateY.setValue(target);
      else Animated.spring(translateY, { toValue: target, useNativeDriver: nativeDriver, damping: 22, stiffness: 220 }).start();
    },
    onPanResponderTerminate: () => translateY.stopAnimation((value) => {
      const target = value < collapsedOffset * 0.5 ? 0 : collapsedOffset;
      offsetRef.current = target;
      if (reduceMotion) translateY.setValue(target);
      else Animated.spring(translateY, { toValue: target, useNativeDriver: nativeDriver, damping: 22, stiffness: 220 }).start();
    })
  }), [collapsedOffset, nativeDriver, reduceMotion, translateY]);

  const togglePanel = () => {
    const target = offsetRef.current > 0 ? 0 : collapsedOffset;
    offsetRef.current = target;
    if (reduceMotion) translateY.setValue(target);
    else Animated.spring(translateY, { toValue: target, useNativeDriver: nativeDriver, damping: 22, stiffness: 220 }).start();
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setPhoto(null);
    setAiAnalysis(null);
    setAiCategoryApplied(false);
    if (typeof id !== 'string') { setLoaded(true); return () => { cancelled = true; }; }
    void Promise.all([getPhoto(id), getPhotoOcrText(id), getPhotoAiDescription(id)]).then(([result, text, description]) => { if (!cancelled) { setPhoto(result); setOcrText(text); setAiDescription(description); setLoaded(true); } }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [id]);

  if (!loaded) return <Message text="加载照片…" />;
  if (!photo) return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><AmbientBackground /><View style={styles.loading}><Text style={[styles.notFound, { color: theme.muted }]}>照片不存在或已从系统相册移除</Text><Pressable accessibilityRole="button" style={[styles.backButton, { backgroundColor: theme.primary }]} onPress={() => router.back()}><Text style={styles.backButtonText}>返回</Text></Pressable></View></SafeAreaView>;

  const moveToTrashConfirmed = async () => {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    setMutating(true);
    try {
      await changeStatus(photo.id, 'trashed');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.back();
    } catch (error) {
      showMessage('移入回收站失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      mutationLocked.current = false;
      setMutating(false);
    }
  };
  const moveToTrash = () => {
    if (mutationLocked.current) return;
    confirmAction('移入回收站？', '不会立即删除系统照片，可在回收站恢复。', '移入', () => void moveToTrashConfirmed(), true);
  };
  const restoreFromTrash = () => confirmAction('恢复这张照片？', '会恢复到移入回收站之前的整理状态。', '恢复', () => {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    setMutating(true);
    void restorePhotos([photo.id]).then(() => router.back()).catch((error) => showMessage('恢复失败', error instanceof Error ? error.message : '请稍后重试。')).finally(() => {
      mutationLocked.current = false;
      setMutating(false);
    });
  });
  const favorite = async () => {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    setMutating(true);
    try {
      await toggleFavorite(photo.id);
      setPhoto((current) => current ? { ...current, favorite: !current.favorite } : current);
      void refresh().catch(() => undefined);
      void Haptics.selectionAsync().catch(() => undefined);
    } catch (error) {
      Alert.alert('收藏失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      mutationLocked.current = false;
      setMutating(false);
    }
  };
  const recognizeLocal = async () => {
    if (recognizing || Platform.OS === 'web') return;
    setRecognizing(true);
    setOcrError('');
    setOcrNotice('');
    try {
      const text = await recognizePhotoTextLocally(photo);
      await savePhotoOcrText(photo.id, text);
      setOcrText(text);
      setOcrNotice(text ? '识别完成，文字已保存到本机。' : '已完成识别，没有发现文字。');
      await refresh().catch(() => undefined);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : '本机识别失败，请稍后重试。');
    } finally {
      setRecognizing(false);
    }
  };
  const recognize = async () => {
    if (recognizing || Platform.OS === 'web') return;
    try {
      const config = await getAIConfig();
      if (!config.apiKey.trim()) {
        Alert.alert('先配置 AI 服务', '在设置中填写支持图片输入的模型和 API Key。', [
          { text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => router.push('/settings/ai') }
        ]);
        return;
      }
      Alert.alert('发送这张照片识别文字？', `图序会将压缩副本发送到 ${config.endpoint}，服务提供方可能收费。`, [
        { text: '取消', style: 'cancel' },
        { text: '确认识别', onPress: () => {
          setRecognizing(true);
          setOcrError('');
          setOcrNotice('');
          void recognizePhotoText(photo).then(async (text) => {
            await savePhotoOcrText(photo.id, text);
            setOcrText(text);
            setOcrNotice('识别完成，文字已保存到本机。');
            await refresh().catch(() => undefined);
          }).catch((error) => {
            const message = error instanceof Error ? error.message : '识别失败，请稍后重试。';
            setOcrError(message);
            Alert.alert('识别失败', message);
          }).finally(() => setRecognizing(false));
        } }
      ]);
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : '读取 AI 配置失败');
    }
  };
  const analyze = async () => {
    if (analyzing || Platform.OS === 'web') return;
    try {
      const config = await getAIConfig();
      if (!config.apiKey.trim()) {
        Alert.alert('先配置 AI 服务', '在设置中填写支持图片输入的模型和 API Key。', [
          { text: '取消', style: 'cancel' }, { text: '去设置', onPress: () => router.push('/settings/ai') }
        ]);
        return;
      }
      Alert.alert('发送压缩图进行 AI 理解？', `图序会将这张照片的压缩副本发送到 ${config.endpoint}，服务提供方可能收费。`, [
        { text: '取消', style: 'cancel' },
        { text: '确认分析', onPress: () => {
          setAnalyzing(true);
          setAiAnalysis(null);
          setAiCategoryApplied(false);
          void analyzePhotoWithAI(config, photo).then(async (result) => {
            const searchableDescription = `${result.summary} ${result.observation}`.trim();
            await savePhotoAiDescription(photo.id, searchableDescription);
            setAiDescription(searchableDescription);
            setAiAnalysis(result);
            await refresh().catch(() => undefined);
          }).catch((error) => {
            Alert.alert('照片分析失败', error instanceof Error ? error.message : '请稍后重试。');
          }).finally(() => setAnalyzing(false));
        } }
      ]);
    } catch (error) {
      Alert.alert('读取 AI 配置失败', error instanceof Error ? error.message : '请稍后重试。');
    }
  };
  const applyAIClassification = async () => {
    if (!aiAnalysis || savingAiCategory) return;
    setSavingAiCategory(true);
    try {
      await setPhotoCategory(photo.id, aiAnalysis.category);
      setPhoto((current) => current ? { ...current, category: aiAnalysis.category } : current);
      setAiCategoryApplied(true);
      await refresh().catch(() => undefined);
    } catch (error) {
      Alert.alert('应用分类失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      setSavingAiCategory(false);
    }
  };
  const clearOcr = () => Alert.alert('清除本地识别文字？', '只会清除图序保存的文字，不会影响系统照片。', [
    { text: '取消', style: 'cancel' },
    { text: '清除', style: 'destructive', onPress: () => { void clearPhotoOcrText(photo.id).then(() => { setOcrText(null); void refresh(); }).catch((error) => Alert.alert('清除失败', error instanceof Error ? error.message : '请稍后重试。')); } }
  ]);
  const copyOcr = async () => {
    if (!ocrText) return;
    try { await Clipboard.setStringAsync(ocrText); setOcrNotice('识别文字已复制。'); }
    catch (error) { setOcrError(error instanceof Error ? error.message : '复制失败'); }
  };
  const sizeIsActual = photo.actualBytes !== null;

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><StatusBar style="light" /><AmbientBackground />
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="查看大图" style={styles.imageStage} onPress={() => setFullScreen(true)}><Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} /><View style={[StyleSheet.absoluteFill, styles.imageShade]} /><Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={140} cachePolicy="memory-disk" /></Pressable>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回" disabled={mutating} style={[styles.headerIcon, mutating && styles.disabled]} onPress={() => router.back()}><Ionicons name="chevron-back" size={31} color="#fff" /></Pressable><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={photo.favorite ? '取消收藏' : '收藏'} disabled={mutating} style={[styles.headerIcon, mutating && styles.disabled]} onPress={() => void favorite()}><Ionicons name={photo.favorite ? 'heart' : 'heart-outline'} size={29} color={photo.favorite ? '#FF453A' : '#fff'} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={photo.status === 'trashed' ? '恢复照片' : '移入回收站'} disabled={mutating} style={[styles.headerIcon, mutating && styles.disabled]} onPress={photo.status === 'trashed' ? restoreFromTrash : moveToTrash}><Ionicons name={photo.status === 'trashed' ? 'arrow-undo' : 'trash-outline'} size={28} color="#fff" /></Pressable></View></View>
    <Animated.View style={[styles.panelWrap, { height: panelHeight, transform: [{ translateY }] }]}><GlassSurface intensity={58} style={[styles.panel, { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder }]}><View accessibilityRole="button" accessibilityLabel="展开或收起照片信息" accessibilityActions={[{ name: 'activate', label: '展开或收起照片信息' }]} onAccessibilityAction={togglePanel} style={styles.handleArea} {...panelResponder.panHandlers}><View style={[styles.handle, { backgroundColor: theme.tertiary }]} /><Text style={[styles.dragHint, { color: theme.muted }]}>点击或拖动查看照片信息</Text></View><ScrollView contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}><Text numberOfLines={2} style={[styles.filename, { color: theme.text }]}>{photo.filename}</Text><Text style={[styles.date, { color: theme.muted }]}>{formatDate(photo.createdAt)}</Text><View style={styles.tags}><Tag text={categoryNames[photo.category] ?? photo.category} theme={theme} /><Tag text={`基础评分 ${photo.aiScore}`} theme={theme} />{photo.exactHash ? <Tag text="已校验原文件" theme={theme} /> : null}</View><View style={[styles.divider, { backgroundColor: theme.border }]} /><Info label="尺寸" value={`${photo.width} × ${photo.height}`} theme={theme} /><Info label={sizeIsActual ? '真实大小' : '估算大小'} value={formatBytes(photo.actualBytes ?? photo.estimatedBytes)} theme={theme} /><Info label="状态" value={photo.status === 'kept' ? '已保留' : photo.status === 'trashed' ? '回收站' : '待整理'} theme={theme} /><Info label="视觉分析" value={photo.analysisVersion >= 2 ? '已完成' : '等待中'} theme={theme} /><View style={[styles.divider, { backgroundColor: theme.border }]} /><View style={styles.ocrHeader}><Text style={[styles.localTitleText, { color: theme.text }]}>图片文字</Text><Pressable accessibilityRole="button" accessibilityLabel="本机识别图片文字" disabled={recognizing || Platform.OS === 'web' || !isLocalOcrAvailable()} style={[styles.ocrButton, (recognizing || Platform.OS === 'web' || !isLocalOcrAvailable()) && styles.disabled]} onPress={() => void recognizeLocal()}><Text style={{ color: theme.primary }}>{recognizing ? '识别中…' : '本机识别'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="云端识别图片文字" disabled={recognizing || Platform.OS === 'web'} style={[styles.ocrButton, (recognizing || Platform.OS === 'web') && styles.disabled]} onPress={() => void recognize()}><Text style={{ color: theme.primary }}>云端识别</Text></Pressable></View><Text style={[styles.localText, { color: theme.muted }]}>{ocrText ? '识别结果保存在本机，可在搜索中查找。请核对可能的识别错误。' : Platform.OS === 'web' ? '请在 Android 或 iOS 应用中识别图片文字。' : isLocalOcrAvailable() ? '本机识别不需要账号或网络；云端识别会先征求你的确认。' : '当前构建不支持本机识别，可使用云端识别或更新应用。'}</Text>{ocrError ? <Text style={[styles.localText, { color: theme.danger }]}>{ocrError}</Text> : null}{ocrNotice ? <Text style={[styles.localText, { color: theme.primary }]}>{ocrNotice}</Text> : null}{ocrText ? <><Text selectable style={[styles.ocrResult, { color: theme.text, backgroundColor: theme.fillSecondary }]}>{ocrText}</Text><Pressable accessibilityRole="button" accessibilityLabel="复制识别文字" onPress={() => void copyOcr()} style={styles.ocrButton}><Text style={{ color: theme.primary }}>复制全部文字</Text></Pressable><Pressable accessibilityRole="button" onPress={clearOcr} style={styles.ocrButton}><Text style={{ color: theme.danger }}>清除本地文字</Text></Pressable></> : null}<View style={[styles.divider, { backgroundColor: theme.border }]} /><View style={styles.ocrHeader}><Text style={[styles.localTitleText, { color: theme.text }]}>AI 图片理解</Text><Pressable accessibilityRole="button" disabled={analyzing || Platform.OS === 'web'} style={[styles.ocrButton, (analyzing || Platform.OS === 'web') && styles.disabled]} onPress={() => void analyze()}><Text style={{ color: theme.primary }}>{analyzing ? '分析中…' : '开始分析'}</Text></Pressable></View><Text style={[styles.localText, { color: theme.muted }]}>{aiDescription ? 'AI 描述已保存在本机，可通过搜索找到这张照片。' : '按需识别场景、分类与画面质量。每次都会先确认发送压缩图至你配置的 AI 服务。'}</Text>{aiDescription && !aiAnalysis ? <Text selectable style={[styles.aiSummary, { color: theme.text, marginTop: 8 }]}>{aiDescription}</Text> : null}{aiAnalysis ? <View style={[styles.aiResult, { backgroundColor: theme.primarySoft }]}><Text selectable style={[styles.aiSummary, { color: theme.text }]}>{aiAnalysis.summary}</Text><Text style={[styles.aiMeta, { color: theme.muted }]}>建议分类：{categoryNames[aiAnalysis.category]} · {aiAnalysis.observation}</Text><Pressable accessibilityRole="button" accessibilityLabel={`采用 AI 分类建议 ${categoryNames[aiAnalysis.category]}`} disabled={savingAiCategory || aiCategoryApplied || photo.category === aiAnalysis.category} style={[styles.applyCategory, { backgroundColor: theme.surface }, (savingAiCategory || aiCategoryApplied || photo.category === aiAnalysis.category) && styles.disabled]} onPress={() => void applyAIClassification()}><Text style={[styles.applyCategoryText, { color: theme.primary }]}>{savingAiCategory ? '正在应用…' : aiCategoryApplied || photo.category === aiAnalysis.category ? '分类已匹配' : `采用分类：${categoryNames[aiAnalysis.category]}`}</Text></Pressable></View> : null}<View style={[styles.divider, { backgroundColor: theme.border }]} /><View style={styles.localTitle}><Ionicons name="lock-closed-outline" size={22} color={theme.primary} /><Text style={[styles.localTitleText, { color: theme.text }]}>本地基础分析</Text></View><Text style={[styles.localText, { color: theme.muted }]}>文件元数据、基础评分与端侧视觉指纹在本机处理；不会自动删除系统照片。AI 功能仅在你主动确认后调用。</Text></ScrollView></GlassSurface></Animated.View>
    <Modal visible={fullScreen} animationType="fade" onRequestClose={() => setFullScreen(false)}><View style={styles.modal}><Pressable accessibilityRole="button" accessibilityLabel="关闭大图" style={styles.close} onPress={() => setFullScreen(false)}><Ionicons name="close" size={33} color="#fff" /></Pressable><Image source={{ uri: photo.uri }} style={styles.fullImage} contentFit="contain" /></View></Modal>
  </SafeAreaView>;
}

function Message({ text }: { text: string }) { const theme = useAppTheme(); return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><AmbientBackground /><View style={styles.loading}><Text style={[styles.notFound, { color: theme.muted }]}>{text}</Text></View></SafeAreaView>; }
function Tag({ text, theme }: { text: string; theme: ReturnType<typeof useAppTheme> }) { return <View style={[styles.tag, { backgroundColor: theme.primarySoft }]}><Text style={[styles.tagText, { color: theme.primary }]}>{text}</Text></View>; }
function Info({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useAppTheme> }) { return <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' }, imageStage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000' }, imageShade: { backgroundColor: 'rgba(0,0,0,.22)' }, header: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerActions: { flexDirection: 'row' }, headerIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 }, panelWrap: { position: 'absolute', left: 10, right: 10, bottom: 0 }, panel: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth }, handleArea: { minHeight: 66, alignItems: 'center', justifyContent: 'center' }, handle: { width: 40, height: 5, borderRadius: 3, opacity: 0.55 }, dragHint: { ...typography.caption, marginTop: 7 }, panelContent: { paddingHorizontal: 18 }, filename: { ...typography.headline }, date: { ...typography.footnote, marginTop: 4 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }, tag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, tagText: { ...typography.caption, fontWeight: '700' }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 }, infoRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, infoLabel: { ...typography.footnote }, infoValue: { ...typography.footnote, fontWeight: '700' }, ocrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, ocrButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }, ocrResult: { ...typography.footnote, lineHeight: 22, padding: 12, borderRadius: 10, marginTop: 10 }, aiResult: { padding: 13, borderRadius: 16, marginTop: 10, gap: 8 }, aiSummary: { ...typography.subheadline, fontWeight: '600' }, aiMeta: { ...typography.footnote, lineHeight: 21 }, applyCategory: { minHeight: 42, alignSelf: 'flex-start', paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' }, applyCategoryText: { ...typography.caption, fontWeight: '700' }, localTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 }, localTitleText: { ...typography.footnote, fontWeight: '700' }, localText: { ...typography.footnote, marginTop: 7 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, notFound: { ...typography.subheadline, textAlign: 'center' }, backButton: { marginTop: 18, minHeight: 44, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, backButtonText: { color: '#fff', ...typography.callout }, modal: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }, fullImage: { width: '100%', height: '100%' }, close: { position: 'absolute', top: 46, right: 16, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
});
