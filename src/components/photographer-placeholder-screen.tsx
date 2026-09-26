import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';

type PhotographerPlaceholderScreenProps = {
  description: string;
  eyebrow: string;
  items: { badge: string; meta: string; title: string }[];
  title: string;
};

export function PhotographerPlaceholderScreen({
  description,
  eyebrow,
  items,
  title,
}: PhotographerPlaceholderScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>

        <View style={styles.placeholderPanel}>
          {items.map((item) => (
            <View key={item.title} style={styles.listCard}>
              <View style={styles.listTopRow}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              </View>
              <Text style={styles.listMeta}>{item.meta}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
