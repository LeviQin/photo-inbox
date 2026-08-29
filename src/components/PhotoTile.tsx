import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/constants/theme';
import type { PhotoRecord } from '@/types/photo';
import { formatDate } from '@/utils/format';

export function PhotoTile({ photo, size, onPress, selected }: {
  photo: PhotoRecord;
  size: number;
  onPress?: () => void;
  selected?: boolean;
}) {
  const theme = useAppTheme();
  const label = `${formatDate(photo.createdAt)} 的${photo.category === 'screenshot' ? '截图' : '照片'}${photo.favorite ? '，已收藏' : ''}`;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.wrap, { width: size, height: size, backgroundColor: theme.fillSecondary }, pressed && { opacity: 0.78 }]}> 
      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={photo.id} />
      {photo.favorite ? (
        <View style={styles.favorite}>
          <Ionicons name="heart" size={13} color="#fff" />
        </View>
      ) : null}
      {selected ? (
        <View style={styles.selected}>
          <Ionicons name="checkmark-circle" size={26} color={theme.primary} />
        </View>
      ) : null}
      {photo.id.startsWith('demo-') ? (
        <View style={styles.demoBadge}><Text style={styles.demoText}>DEMO</Text></View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', minWidth: 44, minHeight: 44 },
  favorite: { position: 'absolute', right: 7, top: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.32)', alignItems: 'center', justifyContent: 'center' },
  selected: { position: 'absolute', inset: 0, backgroundColor: 'rgba(101,116,255,.14)', alignItems: 'flex-end', padding: 6 },
  demoBadge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(0,0,0,.46)' },
  demoText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 }
});
