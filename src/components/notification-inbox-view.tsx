import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { type useNotificationInbox } from '@/hooks/use-notification-inbox';
import { notificationInboxStyles as styles } from '@/styles/notification-inbox.styles';
import { type PhotoSyncNotification } from '@/types/notifications';

type InboxController = ReturnType<typeof useNotificationInbox>;

export function NotificationInboxView({ inbox, role, onClose, onOpenBooking }: {
  inbox: InboxController;
  role: 'client' | 'admin';
  onClose: () => void;
  onOpenBooking: (bookingId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerInner}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Notifications</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <InboxIcon kind="close" color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{role === 'admin'
            ? 'Booking requests and updates from your clients.'
            : 'Your bookings, reminders, and studio updates.'}</Text>
          {inbox.unreadCount !== null ? <View style={styles.count}>
            <Text style={styles.countText}>{inbox.unreadCount === 0 ? 'You’re all caught up' : `${inbox.unreadCount} unread`}</Text>
          </View> : null}
        </View>
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        data={inbox.isLoading ? [] : inbox.items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshing={!inbox.isLoading && inbox.isRefreshing}
        onRefresh={inbox.refresh}
        ListHeaderComponent={<View style={styles.toolbar}>
          <View style={styles.filterRow}>
            {(['all', 'unread'] as const).map((filter) => <Pressable key={filter}
              accessibilityRole="button" accessibilityState={{ selected: inbox.filter === filter }}
              onPress={() => inbox.setFilter(filter)}
              style={({ pressed }) => [styles.filter, inbox.filter === filter && styles.filterActive, pressed && styles.pressed]}>
              <Text style={[styles.filterText, inbox.filter === filter && styles.filterTextActive]}>{filter === 'all' ? 'All' : 'Unread'}</Text>
            </Pressable>)}
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={inbox.isMarking || !inbox.unreadCount}
              onPress={inbox.markAll} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={[styles.actionText, !inbox.unreadCount && styles.mutedAction]}>{inbox.isMarking ? 'Updating…' : 'Mark all as read'}</Text>
            </Pressable>
          </View>
          {inbox.error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{inbox.error}</Text></View> : null}
        </View>}
        renderItem={({ item, index }) => {
          const date = sectionDate(item.createdAt);
          const previousDate = index > 0 ? sectionDate(inbox.items[index - 1].createdAt) : null;
          return <View>
            {date !== previousDate ? <Text style={styles.section}>{date}</Text> : null}
            <NotificationCard notification={item} disabled={inbox.isMarking} onPress={() => {
              inbox.markRead(item);
              if (item.bookingId) onOpenBooking(item.bookingId);
            }} />
          </View>;
        }}
        ListEmptyComponent={inbox.isLoading ? <View accessibilityLabel="Loading notifications">
          {[0, 1, 2].map((index) => <View key={index} style={[styles.card, { paddingVertical: 24 }]}>
            <View style={[styles.skeleton, styles.skeletonTitle]} /><View style={styles.skeleton} />
            <View style={[styles.skeleton, { width: '80%' }]} />
          </View>)}
        </View> : inbox.error ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Updates couldn’t load</Text>
          <Text style={styles.emptyText}>Pull down to try again.</Text>
        </View> : <View style={styles.empty}>
          <View style={styles.emptyIcon}><InboxIcon kind={inbox.filter === 'unread' ? 'check' : 'bell'} size={36} color="#39719F" /></View>
          <Text style={styles.emptyTitle}>{inbox.filter === 'unread' ? 'All caught up!' : 'No notifications yet'}</Text>
          <Text style={styles.emptyText}>{inbox.filter === 'unread'
            ? 'You’ve read all your updates. Check All to revisit them.'
            : role === 'admin' ? 'New booking requests and client updates will appear here.'
              : 'Booking updates and appointment reminders will appear here.'}</Text>
        </View>}
        ListFooterComponent={!inbox.isLoading && inbox.hasMore ? <View style={styles.footer}>
          <Pressable accessibilityRole="button" disabled={inbox.isRefreshing || inbox.isMarking} onPress={inbox.loadMore}
            style={({ pressed }) => [styles.filter, pressed && styles.pressed]}>
            <Text style={styles.actionText}>Show older updates</Text>
          </Pressable>
        </View> : null}
      />
    </View>
  );
}

function NotificationCard({ notification, disabled, onPress }: {
  notification: PhotoSyncNotification; disabled: boolean; onPress: () => void;
}) {
  const appearance = notificationAppearance(notification.title);
  const actionable = Boolean(notification.bookingId) || !notification.isRead;
  return <Pressable accessibilityRole={actionable ? 'button' : undefined}
    accessibilityLabel={`${notification.isRead ? '' : 'Unread. '}${notification.title}. ${notification.message}`}
    accessibilityHint={notification.bookingId ? 'Opens the related booking.' : !notification.isRead ? 'Marks this update as read.' : undefined}
    disabled={disabled || !actionable} onPress={onPress}
    style={({ pressed }) => [styles.card, !notification.isRead && styles.unreadCard, pressed && styles.pressed]}>
    <View style={styles.cardTop}>
      <View style={[styles.icon, { backgroundColor: appearance.background }]}>
        <InboxIcon kind={appearance.kind} color={appearance.color} />
      </View>
      <Text style={styles.cardTitle}>{notification.title}</Text>
      {!notification.isRead ? <View style={styles.unreadDot} /> : null}
    </View>
    <Text style={styles.message}>{notification.message}</Text>
    <View style={styles.metaRow}>
      <Text style={styles.time}>{notificationTime(notification.createdAt)}</Text>
      {notification.bookingId ? <Text style={styles.link}>View booking →</Text> : null}
    </View>
  </Pressable>;
}

export function sectionDate(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updates';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function notificationAppearance(title: string): { kind: IconKind; color: string; background: string } {
  const text = title.toLowerCase();
  if (/reject|cancel|expire/.test(text)) return { kind: 'close', color: '#A34E4E', background: '#FCE5E5' };
  if (/confirm|approv|complet/.test(text)) return { kind: 'check', color: '#24856A', background: '#DCF2EA' };
  if (/reminder|appointment|schedule/.test(text)) return { kind: 'calendar', color: '#39719F', background: '#DCEAF8' };
  if (/request|review/.test(text)) return { kind: 'calendar', color: '#A26F20', background: '#FFF0D6' };
  return { kind: 'bell', color: '#71639A', background: '#ECE7F6' };
}

type IconKind = 'bell' | 'check' | 'close' | 'calendar';
function InboxIcon({ kind, color, size = 24 }: { kind: IconKind; color: string; size?: number }) {
  const paths = {
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    check: 'M5 12l4 4L19 6',
    close: 'M6 6l12 12M18 6L6 18',
    calendar: 'M7 3v4M17 3v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1M8 14h3M8 17h6',
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d={paths[kind]} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
