import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@/components/GeneratedIcon';
import { AmbientBackground } from '@/components/AmbientBackground';
import { useAppTheme, typography } from '@/constants/theme';
import { abandonReviewSession, createReviewSession, decideReviewPhoto, getReviewSession, getReviewSourceSummary, undoLastReviewDecision } from '@/db/database';
import { useAppStore } from '@/store/useAppStore';
import type { ReviewSession, ReviewSource, ReviewSourceSummary, ReviewTarget } from '@/types/photo';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const SWIPE_THRESHOLD = 110;
const sourceLabels: Record<ReviewSource, string> = { all: '全部待整理', screenshot: '截图', large: '大文件', recent: '最近 30 天', year: '按年份' };
const sourceOptions: Array<{ source: Exclude<ReviewSource, 'year'>; icon: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { source: 'all', icon: 'images-outline', hint: '从最近照片开始' },
  { source: 'screenshot', icon: 'phone-portrait-outline', hint: '快速处理临时截图' },
  { source: 'large', icon: 'file-tray-full-outline', hint: '优先查看占空间照片' },
  { source: 'recent', icon: 'time-outline', hint: '整理最近一个月' }
];

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; year?: string }>();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const refresh = useAppStore((state) => state.refresh);
  const dailyReviewed = useAppStore((state) => state.dailyReviewed);
  const preferences = useAppStore((state) => state.reviewPreferences);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [summary, setSummary] = useState<ReviewSourceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stageHeight, setStageHeight] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const actionLocked = useRef(false);
  const mounted = useRef(true);
  const swipeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const photo = session?.items[0];
  const exitReview = () => router.canGoBack() ? router.back() : router.replace('/');

  const beginAction = useCallback(() => {
    if (actionLocked.current) return false;
    actionLocked.current = true;
    setBusy(true);
    return true;
  }, []);

  const endAction = useCallback(() => {
    actionLocked.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  const resetPan = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
  }, [pan]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      swipeAnimation.current?.stop();
    };
  }, []);

  const load = useCallback(async (showCompleted = true) => {
    const [nextSession, nextSummary] = await Promise.all([getReviewSession(showCompleted), getReviewSourceSummary()]);
    setSession(nextSession);
    setSummary(nextSummary);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startSession = useCallback(async (source: ReviewSource, sourceValue: string | null = null) => {
    if (!beginAction()) return;
    try {
      const remainingToday = Math.max(0, preferences.dailyTarget - dailyReviewed);
      const targetCount = remainingToday || preferences.dailyTarget;
      const created = await createReviewSession({ source, sourceValue, targetCount });
      if (!created) { Alert.alert('没有可整理照片', '这个来源暂时没有待整理照片。'); return; }
      setSession(created);
      void refresh().catch(() => undefined);
      void Haptics.selectionAsync().catch(() => undefined);
    } catch (error) {
      Alert.alert('无法开始整理', error instanceof Error ? error.message : '请稍后重试。');
    } finally { endAction(); }
  }, [beginAction, dailyReviewed, endAction, preferences.dailyTarget, refresh]);

  useEffect(() => {
    if (loading || session || !params.source) return;
    const source = ['all', 'screenshot', 'large', 'recent', 'year'].includes(params.source) ? params.source as ReviewSource : null;
    if (source) void startSession(source, source === 'year' ? params.year ?? null : null);
  }, [loading, params.source, params.year, session, startSession]);

  const startExtraGroup = async () => {
    if (!beginAction()) return;
    try { await abandonReviewSession(); setSession(null); await load(false); void refresh().catch(() => undefined); }
    catch (error) { Alert.alert('无法开始新一组', error instanceof Error ? error.message : '请稍后重试。'); }
    finally { endAction(); }
  };

  const commit = useCallback((status: 'kept' | 'trashed', direction: 1 | -1) => {
    if (!photo || !beginAction()) return;
    // PanResponder supplies gestureState from JavaScript. A native Animated.event is an
    // object rather than a callable handler in release builds, so this value must stay JS-driven.
    const animation = Animated.timing(pan, { toValue: { x: direction * width * 1.2, y: 24 }, duration: reduceMotion ? 0 : 180, useNativeDriver: false });
    swipeAnimation.current = animation;
    animation.start(async ({ finished }) => {
      if (!finished || !mounted.current) { if (mounted.current) resetPan(); endAction(); return; }
      let saved = false;
      try {
        const result = await decideReviewPhoto(photo.id, status);
        if (result.unavailable) {
          resetPan();
          await load();
          void refresh().catch(() => undefined);
          if (mounted.current) Alert.alert('已同步整理进度', '当前照片已不在待整理队列中，列表已更新。请检查当前照片后继续。');
          return;
        }
        saved = true;
        const nextSession = await getReviewSession(result.completed);
        resetPan();
        if (mounted.current) setSession(nextSession);
        void refresh().catch(() => undefined);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } catch (error) {
        resetPan();
        if (mounted.current) {
          Alert.alert(
            saved ? '整理已保存' : '整理失败',
            saved ? '决定已经保存，但界面刷新失败，正在重新载入进度。' : error instanceof Error ? error.message : '无法保存这次整理，请重试。'
          );
          if (saved) void load();
        }
      }
      finally { swipeAnimation.current = null; endAction(); }
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [beginAction, endAction, load, pan, photo, reduceMotion, refresh, resetPan, width]);

  const undo = async () => {
    if (!session?.canUndo || !beginAction()) return;
    try { await undoLastReviewDecision(); setSession(await getReviewSession()); void refresh().catch(() => undefined); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }
    catch (error) { Alert.alert('撤销失败', error instanceof Error ? error.message : '无法撤销这次整理，请重试。'); }
    finally { endAction(); }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(photo) && !busy && Math.abs(gesture.dx) > 8,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD) void commit('kept', 1);
      else if (gesture.dx < -SWIPE_THRESHOLD) void commit('trashed', -1);
      else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start()
  }), [busy, commit, pan, photo]);

  if (loading) return <LoadingView />;
  if (!session) return <SourcePicker summary={summary} target={preferences.dailyTarget} dailyReviewed={dailyReviewed} busy={busy} onSelect={startSession} onClose={exitReview} onPreferences={() => router.push('/settings')} />;
  if (session.completed || !photo) return <CompletedView session={session} busy={busy} onUndo={undo} onExtra={startExtraGroup} onHome={() => router.replace('/')} />;

  const decided = session.keptCount + session.trashedCount;
  const rotate = pan.x.interpolate({ inputRange: [-width / 2, 0, width / 2], outputRange: ['-7deg', '0deg', '7deg'], extrapolate: 'clamp' });
  const keepOpacity = pan.x.interpolate({ inputRange: [0, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const trashOpacity = pan.x.interpolate({ inputRange: [-90, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const cardHeight = stageHeight ? Math.max(300, Math.min(640, stageHeight - 10)) : undefined;

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}><AmbientBackground />
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="退出并保存整理进度" style={styles.headerButton} onPress={exitReview}><Ionicons name="close" size={28} color={theme.text} /></Pressable><View style={styles.headerCenter}><Text style={[styles.headerTitle, { color: theme.text }]}>{sourceLabels[session.source]}</Text><Text style={[styles.headerSub, { color: theme.muted }]}>{decided + 1} / {decided + session.items.length}</Text></View><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="撤销上一张" disabled={!session.canUndo || busy} style={[styles.headerButton, (!session.canUndo || busy) && styles.disabled]} onPress={() => void undo()}><Ionicons name="arrow-undo-outline" size={25} color={theme.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="查看操作说明" style={styles.headerButton} onPress={() => Alert.alert('操作说明', '左滑：移至回收站\n右滑：保留\n退出后可继续本组，回收站中的照片可以恢复。')}><Ionicons name="information-circle-outline" size={25} color={theme.muted} /></Pressable></View></View>
    <View style={styles.stage} onLayout={(event) => setStageHeight(event.nativeEvent.layout.height)}><Animated.View style={[styles.card, Platform.OS === 'web' ? webShadow : nativeShadow, { height: cardHeight, backgroundColor: theme.dark, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]} {...panResponder.panHandlers}><Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={32} transition={100} /><View style={[StyleSheet.absoluteFill, styles.imageShade]} /><Image source={{ uri: photo.uri }} style={styles.image} contentFit="contain" transition={100} cachePolicy="memory-disk" recyclingKey={photo.id} /><Animated.View style={[styles.keepBadge, { opacity: keepOpacity }]}><Text style={styles.badgeText}>保留</Text></Animated.View><Animated.View style={[styles.trashBadge, { opacity: trashOpacity }]}><Text style={styles.badgeText}>回收站</Text></Animated.View><View style={styles.caption}><Text numberOfLines={1} style={styles.filename}>{photo.filename}</Text><Text style={styles.score}>{photo.width} × {photo.height} · 基础评分 {photo.aiScore}</Text></View></Animated.View></View>
    <Text style={[styles.tipText, { color: theme.muted }]}>右滑保留<Text style={{ color: theme.tertiary }}> · </Text>左滑移入回收站</Text>
    <View style={[styles.actions, { marginBottom: Math.max(8, insets.bottom) }]}><Pressable accessibilityRole="button" accessibilityLabel="移至回收站" disabled={busy} style={({ pressed }) => [styles.action, styles.trashAction, { backgroundColor: theme.surface, borderColor: theme.border }, busy && styles.disabled, pressed && styles.pressed]} onPress={() => void commit('trashed', -1)}><Ionicons name="trash-outline" size={21} color={theme.danger} /><Text style={[styles.actionText, { color: theme.text }]}>移入回收站</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="保留照片" disabled={busy} style={({ pressed }) => [styles.action, styles.keepAction, { backgroundColor: theme.primary }, busy && styles.disabled, pressed && styles.pressed]} onPress={() => void commit('kept', 1)}><Ionicons name="heart-outline" size={21} color="#fff" /><Text style={[styles.actionText, { color: '#fff' }]}>保留这张</Text></Pressable></View>
  </SafeAreaView>;
}

function SourcePicker({ summary, target, dailyReviewed, busy, onSelect, onClose, onPreferences }: { summary: ReviewSourceSummary | null; target: ReviewTarget; dailyReviewed: number; busy: boolean; onSelect: (source: ReviewSource, sourceValue?: string | null) => Promise<void>; onClose: () => void; onPreferences: () => void }) {
  const theme = useAppTheme();
  const availableSources = sourceOptions.filter((item) => (summary?.counts[item.source] ?? 0) > 0);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <AmbientBackground />
      <View style={styles.pickerHeader}>
        <View>
          <Text style={[styles.pickerTitle, { color: theme.text }]}>从哪一组开始？</Text>
          <Text style={[styles.pickerSubtitle, { color: theme.muted }]}>
            {dailyReviewed >= target ? '今日目标已完成，可继续整理' : '今日已完成 ' + dailyReviewed + ' / ' + target + ' 张'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" style={styles.headerButton} onPress={onClose}><Ionicons name="close" size={28} color={theme.text} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pickerContent} showsVerticalScrollIndicator={false}>
        <View style={styles.targetSummary}>
          <Text style={[styles.targetSummaryText, { color: theme.muted }]}>每日目标 {target} 张</Text>
          <Pressable accessibilityRole="button" onPress={onPreferences} style={styles.targetSettings}><Text style={[styles.targetSettingsText, { color: theme.primary }]}>调整</Text></Pressable>
        </View>
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>选一个轻松开始</Text>
        <View style={[styles.sourceList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {availableSources.map((item, index) => {
            const count = summary?.counts[item.source] ?? 0;
            return <View key={item.source}><Pressable accessibilityRole="button" accessibilityLabel={sourceLabels[item.source] + '，' + count + ' 张'} disabled={busy} style={({ pressed }) => [styles.sourceRow, busy && styles.disabled, pressed && styles.pressed]} onPress={() => void onSelect(item.source)}>
              <View style={[styles.sourceIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={item.icon} size={21} color={theme.primary} /></View>
              <View style={styles.sourceCopy}><Text style={[styles.sourceTitle, { color: theme.text }]}>{sourceLabels[item.source]}</Text><Text numberOfLines={1} style={[styles.sourceHint, { color: theme.muted }]}>{item.hint}</Text></View>
              <Text style={[styles.sourceCount, { color: theme.muted }]}>{count.toLocaleString()} 张</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.tertiary} />
            </Pressable>{index < availableSources.length - 1 ? <View style={[styles.sourceDivider, { backgroundColor: theme.border }]} /> : null}</View>;
          })}
        </View>
        {summary?.years.length ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>按年份</Text>
            <View style={styles.yearWrap}>{summary.years.map((item) => <Pressable key={item.year} accessibilityRole="button" disabled={busy} onPress={() => void onSelect('year', String(item.year))} style={({ pressed }) => [styles.yearButton, { borderColor: theme.border, backgroundColor: theme.surface }, pressed && styles.pressed]}><Text style={[styles.yearText, { color: theme.text }]}>{item.year}</Text><Text style={[styles.yearCount, { color: theme.muted }]}>{item.count} 张</Text></Pressable>)}</View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CompletedView({ session, busy, onUndo, onExtra, onHome }: { session: ReviewSession; busy: boolean; onUndo: () => Promise<void>; onExtra: () => Promise<void>; onHome: () => void }) {
  const theme = useAppTheme();
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><AmbientBackground /><View style={styles.done}><View style={[styles.doneIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="checkmark" size={43} color={theme.primary} /></View><Text style={[styles.doneTitle, { color: theme.text }]}>这一组整理好了</Text><Text style={[styles.doneText, { color: theme.muted }]}>{sourceLabels[session.source]} · 保留 {session.keptCount} 张 · 回收站 {session.trashedCount} 张</Text>{session.canUndo ? <Pressable accessibilityRole="button" disabled={busy} style={styles.undoButton} onPress={() => void onUndo()}><Ionicons name="arrow-undo-outline" size={24} color={theme.primary} /><Text style={[styles.undoButtonText, { color: theme.primary }]}>撤销上一张</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={busy} style={[styles.doneButton, { backgroundColor: theme.primary }]} onPress={() => void onExtra()}><Text style={styles.doneButtonText}>再整理一组</Text></Pressable><Pressable accessibilityRole="button" style={styles.homeButton} onPress={onHome}><Text style={[styles.homeButtonText, { color: theme.muted }]}>回到今日</Text></Pressable></View></SafeAreaView>;
}

function LoadingView() { const theme = useAppTheme(); return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><AmbientBackground /><View style={styles.done}><Text style={[styles.doneText, { color: theme.muted }]}>正在恢复整理进度…</Text></View></SafeAreaView>; }

const nativeShadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 };
const webShadow = { boxShadow: '0 12px 30px rgba(0, 0, 0, 0.14)' } as const;
const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 62, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { position: 'absolute', left: 90, right: 90, alignItems: 'center', pointerEvents: 'none' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { ...typography.callout },
  headerSub: { ...typography.caption, marginTop: 2 },
  stage: { flex: 1, paddingHorizontal: 14, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 460, minHeight: 300, borderRadius: 20, overflow: 'hidden' },
  imageShade: { backgroundColor: 'rgba(0,0,0,.16)' },
  image: { flex: 1 },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingTop: 50, backgroundColor: 'rgba(0,0,0,.38)' },
  filename: { color: '#fff', ...typography.footnote, fontWeight: '700' },
  score: { color: 'rgba(255,255,255,.76)', ...typography.caption, marginTop: 5 },
  keepBadge: { position: 'absolute', top: 28, left: 24, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 2, borderColor: '#fff', borderRadius: 10, transform: [{ rotate: '-8deg' }] },
  trashBadge: { position: 'absolute', top: 28, right: 24, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 2, borderColor: '#fff', borderRadius: 10, transform: [{ rotate: '8deg' }] },
  badgeText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  tipText: { ...typography.caption, textAlign: 'center', marginVertical: 8 },
  actions: { minHeight: 62, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { flex: 1, minHeight: 58, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  trashAction: {},
  keepAction: { borderWidth: 0 },
  actionText: { ...typography.footnote, fontWeight: '700' },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.78 },
  pickerHeader: { minHeight: 82, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { ...typography.title1 },
  pickerSubtitle: { ...typography.footnote, marginTop: 4 },
  pickerContent: { paddingHorizontal: 16, paddingBottom: 38 },
  sectionLabel: { ...typography.caption, marginTop: 18, marginBottom: 9, marginLeft: 4 },
  targetSummary: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetSummaryText: { ...typography.footnote },
  targetSettings: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  targetSettingsText: { ...typography.footnote, fontWeight: '600' },
  sourceList: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sourceRow: { minHeight: 72, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sourceCopy: { flex: 1, minWidth: 0 },
  sourceTitle: { ...typography.footnote, fontWeight: '700' },
  sourceHint: { ...typography.caption, marginTop: 3 },
  sourceCount: { ...typography.caption, fontWeight: '600' },
  sourceDivider: { height: StyleSheet.hairlineWidth, marginLeft: 62, marginRight: 12 },
  yearWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearButton: { minWidth: 104, minHeight: 54, paddingHorizontal: 14, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  yearText: { ...typography.callout },
  yearCount: { ...typography.caption, marginTop: 1 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { marginTop: 20, ...typography.title2 },
  doneText: { marginTop: 8, ...typography.subheadline, textAlign: 'center' },
  undoButton: { minHeight: 44, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  undoButtonText: { ...typography.footnote, fontWeight: '700' },
  doneButton: { marginTop: 22, minHeight: 52, minWidth: 210, paddingHorizontal: 30, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  doneButtonText: { color: '#fff', ...typography.callout },
  homeButton: { minHeight: 44, marginTop: 7, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  homeButtonText: { ...typography.footnote, fontWeight: '600' }
});
