import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll } from '@/hooks/use-client-nav-scroll';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useNotificationUnreadCount } from '@/hooks/use-notification-unread-count';
import { useClientHomeHighlights } from '@/hooks/use-client-home-highlights';
import { HomeHighlights } from '@/components/home-highlights';
import { responsiveStyles as styles } from '@/styles/responsive.styles';

export default function HomePageScreen() {
  const navHeight = useBottomNavHeight();
  const navScroll = useClientNavScroll();
  const insets = useSafeAreaInsets();
  const { unreadCount: unreadNotificationCount, error: notificationError, isRefreshing: isCountRefreshing,
    refresh: refreshNotificationCount } = useNotificationUnreadCount();
  const { highlights, error: highlightsError, isLoading: isLoadingHighlights,
    isRefreshing: isRefreshingHighlights, refresh: refreshHighlights, getHighlight } = useClientHomeHighlights();
  const unreadNotificationCountText = formatNotificationBadgeCount(
    unreadNotificationCount,
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        {...navScroll}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: navHeight + insets.bottom + 24 }}
      >
        <View style={styles.hero}>
          <Image
            contentFit="cover"
            source={require('@/assets/images/Home.png')}
            style={styles.backdrop}
          />
          <View style={styles.scrim} />
          <View
            style={[
              styles.heroContent,
              { paddingTop: insets.top + 20, minHeight: 520 },
            ]}
          >
            <View style={styles.brandRow}>
              <View style={{ width: 44 }} />
              <Text style={styles.brand}>PhotoSync</Text>
              <Pressable
                accessibilityLabel={unreadNotificationCount === null ? 'Open notifications'
                  : `Open notifications, ${unreadNotificationCount} unread`}
                accessibilityRole="button"
                onPress={() => router.push('/notifications')}
                style={styles.iconButton}
              >
                <BellIcon color="#FFFFFF" size={28} />
                {unreadNotificationCountText ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      backgroundColor: '#ED2314',
                      borderRadius: 10,
                      paddingHorizontal: 5,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 11 }}>
                      {unreadNotificationCountText}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
            {notificationError ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry notification count"
                disabled={isCountRefreshing} onPress={() => { void refreshNotificationCount(); }}
                style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.8 }]}>
                <Text accessibilityRole="alert" style={[styles.heroText, { fontSize: 12, lineHeight: 18 }]}>
                  {unreadNotificationCount === null
                    ? 'Couldn’t load the notification count. Tap to try again.'
                    : 'Couldn’t update the notification count. Showing the last known count. Tap to try again.'}
                </Text>
              </Pressable>
            ) : null}
            <View style={{ marginTop: 64, gap: 10 }}>
              <Image
                contentFit="contain"
                source={require('@/assets/icons/home-camera-white.png')}
                style={{ width: 38, height: 30 }}
              />
              <Text
                style={[
                  styles.heroTitle,
                  { fontFamily: 'Italianno', fontSize: 36, lineHeight: 46 },
                ]}
              >
                PhotoSync Studio
              </Text>
              <Text style={styles.eyebrow}>— PHOTOGRAPHY —</Text>
              <Text style={styles.heroTitle}>Capture a Brighter Tomorrow.</Text>
              <Text style={[styles.heroText, { maxWidth: 360 }]}>
                Professional photography for life&apos;s meaningful moments.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/services')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: '#3D83AC', marginTop: 12 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.buttonText}>Book a session</Text>
            </Pressable>
          </View>
        </View>
        <View
          style={[
            styles.content,
            {
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: '#F3EEEE',
              marginTop: -12,
            },
          ]}
        >
          <HomeHighlights items={highlights} isLoading={isLoadingHighlights} error={highlightsError}
            isRefreshing={isRefreshingHighlights} onRetry={() => { void refreshHighlights(); }}
            onSelect={(item) => {
              const current = getHighlight(item.id);
              if (current) router.push({ pathname: '/services/[slug]', params: { slug: current.slug } });
            }} />
        </View>
      </ScrollView>
    </View>
  );
}

function formatNotificationBadgeCount(count: number | null) {
  if (count === null || count <= 0) {
    return '';
  }

  return count > 99 ? '99+' : String(count);
}

function BellIcon({
  color = '#142C4C',
  size,
}: {
  color?: string;
  size: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 16V11C18 7.7 16 5.2 13 4.4V3.8C13 3.1 12.5 2.6 11.8 2.6C11.1 2.6 10.6 3.1 10.6 3.8V4.4C7.7 5.1 5.8 7.7 5.8 11V16L4.4 18H19.4L18 16Z"
        fill={color}
      />
      <Path
        d="M9.8 19.4C10.2 20.3 11 20.8 12 20.8C13 20.8 13.8 20.3 14.2 19.4"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}
