import { Image, type ImageSource } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppAlert } from '@/components/app-alert';
import { ClientCatalogNotice } from '@/components/client-catalog-notice';
import { MotionPressable } from '@/components/motion-pressable';
import { useClientServiceCatalog } from '@/hooks/use-client-service-catalog';
import { setSelectedPackage } from '@/services/booking-draft';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
import type {
  ServiceCatalogItem,
  ServiceSlug,
} from '@/types/services';

export default function ServicePackagesScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const serviceSlug = normalizeSlug(slug);
  const insets = useSafeAreaInsets();
  const state = useClientServiceCatalog();
  const { isLoading } = state;
  const service = state.services.find((item) => item.slug === serviceSlug) ?? null;
  const packages = service ? state.packages.filter((item) => item.serviceId === service.id) : [];
  const hero = getHeroSource(service);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        refreshControl={
          <RefreshControl
            refreshing={!isLoading && state.isRefreshing}
            enabled={Boolean(state.accountId)}
            onRefresh={() => { void state.refresh(); }}
          />
        }
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        key={serviceSlug}
        data={packages}
        extraData={state}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              {hero ? (
                <Image contentFit="cover" source={hero} style={styles.backdrop} />
              ) : null}
              <View style={styles.scrim} />
              <View style={[styles.heroContent, { paddingTop: insets.top + 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => router.back()}
                  style={[styles.iconButton, { alignSelf: 'flex-start' }]}
                >
                  <Text style={[styles.heroText, { fontSize: 28 }]}>‹</Text>
                </Pressable>
                <Text style={styles.heroTitle}>
                  {service?.name ?? (state.hasLoaded ? 'Service unavailable' : 'Photography Service')}
                </Text>
                <Text style={styles.heroText}>
                  {service?.description ??
                    'Choose the package that fits your story.'}
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
        renderItem={({ item, index }) => (
          <View style={[styles.content, {
            paddingTop: index === 0 && !state.error ? 20 : 0,
            paddingBottom: 16,
          }]}>
            <View style={styles.card}>
              <View style={[styles.row, { alignItems: 'flex-start' }]}>
                <Image
                  source={item.image}
                  contentFit="cover"
                  style={styles.thumbnail}
                />
                <View style={styles.copy}>
                  {item.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.heading}>{item.name}</Text>
                  <Text style={styles.price}>{item.price}</Text>
                </View>
              </View>
              {item.inclusions.map((detail, index) => (
                <Text key={index} style={styles.text}>
                  • {detail}
                </Text>
              ))}
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel={'Select ' + item.name}
                onPress={() => {
                  if (!state.isCurrentSession()) return;
                  // A confirmed deactivation or a newer read can remove a card
                  // between render and a tap. Use the current shared snapshot.
                  const current = state.getPackage(item.id, item.serviceId);
                  if (!current) {
                    showAppAlert('Package unavailable', 'This package is no longer available. Please choose another package.');
                    void state.refresh();
                    return;
                  }
                  setSelectedPackage(current);
                  router.push('/book/selected');
                }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Select</Text>
              </MotionPressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.content}>
            {isLoading || state.hasLoaded ? (
              <View style={styles.card}>
                <Text style={styles.heading}>
                  {isLoading ? 'Loading packages...' : service ? 'No packages yet' : 'Service unavailable'}
                </Text>
                {!isLoading ? (
                  <Text style={styles.text}>
                    {service ? 'There are no packages available for this service yet.' : 'This service is no longer available.'}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

function getHeroSource(service: ServiceCatalogItem | null): ImageSource | null {
  if (!service) {
    return null;
  }

  if (service.slug === 'portrait-photography' && !service.imageUrl) {
    return require('@/assets/services/portrait/portrait-detail-hero.png');
  }

  return service.image;
}

function normalizeSlug(slug?: string | string[]): ServiceSlug {
  if (Array.isArray(slug)) {
    return slug[0] ?? 'portrait-photography';
  }

  return slug ?? 'portrait-photography';
}
