import { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { PhotoTile } from '@/components/PhotoTile';
import type { PhotoRecord } from '@/types/photo';

export function PhotoGrid({ photos, columns, bottomInset = 0 }: { photos: PhotoRecord[]; columns?: number; bottomInset?: number }) {
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
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      /> : null}
    </View>
  );
}
