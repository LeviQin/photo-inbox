import { useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme, typography } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

const SWIPE_THRESHOLD = 110;

export default function ReviewScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const changeStatus = useAppStore((state) => state.changeStatus);
  const queue = useRef(useAppStore.getState().photos.filter((photo) => photo.status === 'active').slice(0, 50)).current;
  const history = useRef<Array<{ photoId: string; status: 'kept' | 'trashed' }>>([]);
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState(0);
  const [trashed, setTrashed] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stageHeight, setStageHeight] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const photo = queue[index];
  const nativeDriver = Platform.OS !== 'web';
  const cardShadow = Platform.OS === 'web' ? { boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.12)' } : nativeShadow;
  const close = () => history.current.length ? Alert.alert('已保存本次进度', '已经处理的照片会保留在对应状态。', [{ text: '继续整理', style: 'cancel' }, { text: '退出', onPress: () => router.back() }]) : router.back();

  const commit = async (status: 'kept' | 'trashed', direction: 1 | -1) => {
    if (!photo || busy) return;
    setBusy(true);
    Animated.timing(pan, { toValue: { x: direction * width * 1.2, y: 30 }, duration: 180, useNativeDriver: nativeDriver }).start(async ({ finished }) => {
      if (!finished) { setBusy(false); return; }
      try { await changeStatus(photo.id, status); history.current.push({ photoId: photo.id, status }); setCanUndo(true); if (status === 'kept') setKept((value) => value + 1); else setTrashed((value) => value + 1); setIndex((value) => value + 1); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      catch (error) { pan.setValue({ x: 0, y: 0 }); Alert.alert('整理失败', error instanceof Error ? error.message : '无法保存这次整理，请重试。'); }
      finally { pan.setValue({ x: 0, y: 0 }); setBusy(false); }
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const undo = async () => {
    if (!history.current.length || busy) return;
    setBusy(true);
    const undone = history.current.pop()!;
    try { await changeStatus(undone.photoId, 'active'); if (undone.status === 'kept') setKept((value) => Math.max(0, value - 1)); else setTrashed((value) => Math.max(0, value - 1)); setIndex((value) => Math.max(0, value - 1)); setCanUndo(history.current.length > 0); await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    catch (error) { history.current.push(undone); setCanUndo(true); Alert.alert('撤销失败', error instanceof Error ? error.message : '无法撤销这次整理，请重试。'); }
    finally { setBusy(false); }
  };

  const panResponder = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, gesture) => !busy && Math.abs(gesture.dx) > 8, onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: nativeDriver }), onPanResponderRelease: (_, gesture) => { if (gesture.dx > SWIPE_THRESHOLD) void commit('kept', 1); else if (gesture.dx < -SWIPE_THRESHOLD) void commit('trashed', -1); else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: nativeDriver }).start(); } }), [busy, nativeDriver, photo, width]);

  if (!photo) return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.done}><View style={[styles.doneIcon, { backgroundColor: theme.success }]}><Ionicons name="checkmark" size={34} color="#fff" /></View><Text style={[styles.doneTitle, { color: theme.text }]}>今日整理完成</Text><Text style={[styles.doneText, { color: theme.muted }]}>保留 {kept} 张 · 移入回收站 {trashed} 张</Text>{canUndo ? <Pressable accessibilityRole="button" accessibilityLabel="撤销上一张" disabled={busy} style={styles.undoButton} onPress={() => void undo()}><Ionicons name="arrow-undo-outline" size={18} color={theme.primary} /><Text style={[styles.undoButtonText, { color: theme.primary }]}>撤销上一张</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="回到今日" style={[styles.doneButton, { backgroundColor: theme.primary }]} onPress={() => router.replace('/')}><Text style={styles.doneButtonText}>回到今日</Text></Pressable></View></SafeAreaView>;

  const rotate = pan.x.interpolate({ inputRange: [-width / 2, 0, width / 2], outputRange: ['-7deg', '0deg', '7deg'], extrapolate: 'clamp' });
  const keepOpacity = pan.x.interpolate({ inputRange: [0, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const trashOpacity = pan.x.interpolate({ inputRange: [-90, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const cardHeight = stageHeight ? Math.max(300, Math.min(620, stageHeight - 20)) : undefined;

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="关闭整理" style={styles.headerButton} onPress={close}><Ionicons name="close" size={26} color={theme.text} /></Pressable><View pointerEvents="none" style={styles.headerCenter}><Text style={[styles.headerTitle, { color: theme.text }]}>今日整理</Text><Text style={[styles.headerSub, { color: theme.muted }]}>{index + 1} / {queue.length}</Text></View><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="撤销上一张" disabled={!canUndo || busy} style={[styles.headerButton, (!canUndo || busy) && styles.disabled]} onPress={() => void undo()}><Ionicons name="arrow-undo-outline" size={23} color={theme.muted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="查看操作说明" style={styles.headerButton} onPress={() => Alert.alert('操作说明', '左滑：移至回收站\n右滑：保留\n所有移除的照片都可以在回收站恢复。')}><Ionicons name="help-circle-outline" size={24} color={theme.muted} /></Pressable></View></View><View style={styles.stage} onLayout={(event) => setStageHeight(event.nativeEvent.layout.height)}><Animated.View style={[styles.card, cardShadow, { height: cardHeight, backgroundColor: theme.dark, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]} {...panResponder.panHandlers}><Image source={{ uri: photo.uri }} style={styles.image} contentFit="contain" transition={100} /><Animated.View style={[styles.keepBadge, { opacity: keepOpacity }]}><Text style={styles.keepText}>保留</Text></Animated.View><Animated.View style={[styles.trashBadge, { opacity: trashOpacity }]}><Text style={styles.trashText}>移至回收站</Text></Animated.View><LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,.82)']} style={styles.caption}><Text numberOfLines={1} style={styles.filename}>{photo.filename}</Text><Text style={styles.score}>本地质量评分 {photo.aiScore}</Text></LinearGradient></Animated.View></View><View style={styles.tip}><Ionicons name="information-circle-outline" size={16} color={theme.muted} /><Text style={[styles.tipText, { color: theme.muted }]}>不会立即删除系统照片</Text></View><View style={[styles.actions, { paddingBottom: Math.max(8, insets.bottom) }]}><Pressable accessibilityRole="button" accessibilityLabel="移至回收站" disabled={busy} style={[styles.action, { borderColor: theme.border }, busy && styles.disabled]} onPress={() => void commit('trashed', -1)}><Ionicons name="trash-outline" size={22} color={theme.danger} /><Text style={[styles.actionText, { color: theme.danger }]}>移至回收站</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="保留照片" disabled={busy} style={[styles.action, { borderColor: theme.border }, busy && styles.disabled]} onPress={() => void commit('kept', 1)}><Ionicons name="heart-outline" size={23} color={theme.primary} /><Text style={[styles.actionText, { color: theme.primary }]}>保留</Text></Pressable></View></SafeAreaView>;
}

const nativeShadow = Platform.OS === 'web' ? {} : { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 };

const styles = StyleSheet.create({ safe: { flex: 1 }, header: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, headerCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, headerTitle: { ...typography.callout }, headerSub: { ...typography.caption, marginTop: 2 }, stage: { flex: 1, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }, card: { width: '100%', maxWidth: 430, minHeight: 300, borderRadius: 20, overflow: 'hidden' }, image: { flex: 1 }, caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingTop: 46 }, filename: { color: '#fff', ...typography.footnote, fontWeight: '600' }, score: { color: 'rgba(255,255,255,.78)', ...typography.caption, marginTop: 5 }, keepBadge: { position: 'absolute', top: 28, left: 24, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 2, borderColor: '#fff', borderRadius: 10, transform: [{ rotate: '-8deg' }] }, keepText: { color: '#fff', fontSize: 20, fontWeight: '700' }, trashBadge: { position: 'absolute', top: 28, right: 24, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 2, borderColor: '#fff', borderRadius: 10, transform: [{ rotate: '8deg' }] }, trashText: { color: '#fff', fontSize: 18, fontWeight: '700' }, tip: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, tipText: { ...typography.caption }, actions: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, action: { minHeight: 52, minWidth: 150, paddingHorizontal: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, actionText: { ...typography.callout }, disabled: { opacity: 0.45 }, done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, doneIcon: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, doneTitle: { marginTop: 20, ...typography.title2 }, doneText: { marginTop: 8, ...typography.subheadline }, undoButton: { minHeight: 44, marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }, undoButtonText: { ...typography.footnote, fontWeight: '600' }, doneButton: { marginTop: 28, minHeight: 50, paddingHorizontal: 30, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, doneButtonText: { color: '#fff', ...typography.callout }
});
