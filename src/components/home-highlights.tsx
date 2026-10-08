import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { responsiveStyles as styles } from '@/styles/responsive.styles';
import { type ServiceHighlight } from '@/types/services';

export function HomeHighlights({ items, isLoading, isRefreshing, error, onRetry, onSelect }: {
  items: ServiceHighlight[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (service: ServiceHighlight) => void;
}) {
  return <>
    <Text style={styles.heading}>Our Highlights</Text>
    {isLoading && !items.length ? <View accessibilityLabel="Loading highlights" style={[styles.row, { alignItems: 'flex-start' }]}>
      {[0, 1, 2].map((index) => <View key={index} style={{ flex: 1, minWidth: 0, gap: 10 }}>
        <View style={{ width: '100%', aspectRatio: 0.72, borderRadius: 10, backgroundColor: '#E3DEDE' }} />
        <View style={{ height: 14, borderRadius: 7, backgroundColor: '#E3DEDE', width: '80%', alignSelf: 'center' }} />
      </View>)}
    </View> : items.length ? <View style={[styles.row, { alignItems: 'flex-start' }]}>
      {items.map((item) => <Pressable key={item.id}
        accessibilityRole="button" accessibilityLabel={item.name} accessibilityHint="Opens this service."
        onPress={() => onSelect(item)}
        style={({ pressed }) => [{ flex: 1, minWidth: 0, gap: 10 }, pressed && { opacity: 0.8 }]}>
        <Image contentFit="cover" source={{ uri: item.imageUrl }} accessibilityLabel={item.name}
          style={{ width: '100%', aspectRatio: 0.72, borderRadius: 10, backgroundColor: '#E3DEDE' }} />
        <Text style={[styles.text, styles.centeredText]}>{item.name}</Text>
      </Pressable>)}
      {Array.from({ length: Math.max(0, 3 - items.length) }, (_, index) => <View key={`space-${index}`} style={{ flex: 1 }} />)}
    </View> : !error ? <Text style={styles.text}>Studio highlights will appear here once service photos are available.</Text> : null}
    {error ? <View style={{ gap: 4 }}>
      <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry loading highlights"
        disabled={isLoading || isRefreshing} onPress={onRetry}
        style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, pressed && { opacity: 0.8 }]}>
        <Text style={[styles.label, { color: '#3D83AC' }]}>Try again</Text>
      </Pressable>
    </View> : null}
  </>;
}
