import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { PhotoTile } from '@/components/PhotoTile';
import type { PhotoRecord } from '@/types/photo';

export function PhotoGrid({ photos, columns, topInset = 0, bottomInset = 0, onEndReached, loadingMore = false }: { photos: PhotoRecord[]; columns?: number; topInset?: number; bottomInset?: number; onEndReached?: () => void; loadingMore?: boolean }) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const gap = 3;
  const resolvedColumns = columns ?? (width >= 900 ? 7 : width >= 600 ? 5 : 3);
  const available = Math.max(0, width);
  const size = Math.max(44, Math.floor((available - gap * (resolvedColumns - 1)) / resolvedColumns));

  return (
    <View style={{ flex: 1 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? <FlashList
        key={resolvedColumns}
        data={photos}
        numColumns={resolvedColumns}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={{ marginRight: index % resolvedColumns === resolvedColumns - 1 ? 0 : gap, marginBottom: gap }}>
            <PhotoTile photo={item} size={size} onPress={() => router.push(`/photo/${item.id}`)} />
          </View>
        )}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomInset }}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ height: 48 }} /> : null}
      /> : null}
    </View>
  );
}
