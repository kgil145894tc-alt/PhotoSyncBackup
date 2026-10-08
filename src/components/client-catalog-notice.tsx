import { Pressable, Text, View } from 'react-native';

import { responsiveStyles as styles } from '@/styles/responsive.styles';

export function ClientCatalogNotice({ error, isRefreshing, onRetry }: {
  error: string | null;
  isRefreshing: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.text}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry loading services and packages"
        disabled={isRefreshing} onPress={onRetry}
        style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.8 }]}>
        <Text style={styles.label}>Try again</Text>
      </Pressable>
    </View>
  );
}
