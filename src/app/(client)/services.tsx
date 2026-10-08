import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll } from '@/hooks/use-client-nav-scroll';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClientCatalogNotice } from '@/components/client-catalog-notice';
import { useClientServiceCatalog } from '@/hooks/use-client-service-catalog';
import { responsiveStyles as styles } from '@/styles/responsive.styles';

export default function ServicesScreen() {
  const navHeight = useBottomNavHeight();
  const navScroll = useClientNavScroll();
  const insets = useSafeAreaInsets();
  const state = useClientServiceCatalog();
  const { services, isLoading } = state;
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        {...navScroll}
        refreshControl={
          <RefreshControl
            refreshing={!isLoading && state.isRefreshing}
            enabled={Boolean(state.accountId)}
            onRefresh={() => { void state.refresh(); }}
          />
        }
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: navHeight + insets.bottom + 16,
        }}
        data={services}
        extraData={state}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Image
                contentFit="cover"
                source={require('@/assets/services/services-hero.png')}
                style={styles.backdrop}
              />
              <View style={styles.scrim} />
              <View style={[styles.heroContent, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.brand}>PhotoSync</Text>
                <Text style={[styles.eyebrow, { marginTop: 16 }]}>
                  OUR SERVICES
                </Text>
                <Text style={styles.heroTitle}>Different Stories.</Text>
                <Text style={styles.script}>
                  Beautifully{' '}
                  <Text style={[styles.heroTitle, { fontSize: 28 }]}>
                    Captured.
                  </Text>
                </Text>
                <Text style={styles.heroText}>
                  From milestones to once-in-a-lifetime moments, we&apos;re here to
                  capture what matters the most.
                </Text>
              </View>
            </View>
            {state.error ? (
              <View style={[styles.content, { paddingBottom: 16 }]}>
                <ClientCatalogNotice
                  error={state.error}
                  isRefreshing={state.isRefreshing}
                  onRetry={() => { void state.refresh(); }}
                />
              </View>
            ) : null}
          </>
        }
        renderItem={({ item: service, index }) => (
          <View style={[styles.content, {
            paddingTop: index === 0 && !state.error ? 20 : 0,
            paddingBottom: 16,
          }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={service.cardTitle}
              onPress={() => {
                if (state.isCurrentSession()) router.push({ pathname: '/services/[slug]', params: { slug: service.slug } });
              }}
              style={({ pressed }) => [
                styles.card,
                styles.row,
                pressed && { opacity: 0.82 },
              ]}
            >
              <Image
                contentFit="cover"
                source={service.image}
                style={styles.thumbnail}
              />
              <View style={styles.copy}>
                <Text style={styles.label}>{service.cardTitle}</Text>
                <Text style={[styles.text, { fontSize: 13, lineHeight: 19 }]}>
                  {service.cardDescription}
                </Text>
              </View>
              <View
                style={[
                  styles.iconButton,
                  { backgroundColor: '#EEE7E7', minWidth: 32 },
                ]}
              >
                <Text style={styles.label}>›</Text>
              </View>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.content}>
            {isLoading ? (
              <Text accessibilityRole="progressbar" style={styles.text}>
                Loading services...
              </Text>
            ) : null}
            {state.hasLoaded ? (
              <View style={styles.card}>
                <Text style={styles.heading}>No services available</Text>
                <Text style={styles.text}>The studio has no available services at the moment.</Text>
              </View>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
