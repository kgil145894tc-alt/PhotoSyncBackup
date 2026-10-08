import { supabase } from '@/lib/supabase';
import { getStudioSettings } from '@/services/studio-settings';
import { ensureBookingReminderNotifications } from '@/services/booking-reminders';
import { type NotificationCursor, type NotificationFilter, type NotificationInbox, type PhotoSyncNotification } from '@/types/notifications';

export { ensureBookingReminderNotifications } from '@/services/booking-reminders';

type NotificationRow = {
  booking_id: string | null;
  created_at: string;
  id: string;
  is_read: boolean;
  message: string;
  title: string;
  user_id: string;
};

type AdminNotificationValues = {
  bookingId: string;
  message: string;
  title: string;
};

export async function createAdminBookingSubmittedNotifications({
  bookingId,
  clientName,
  packageName,
}: {
  bookingId: string;
  clientName: string;
  packageName: string;
}) {
  await createAdminBookingNotifications({
    booking_id: bookingId,
    message: `${clientName} submitted a ${packageName} booking request.`,
    title: 'New booking request',
  });
}

export async function createAdminBookingCancelledNotifications({
  bookingId,
  clientName,
  packageName,
}: {
  bookingId: string;
  clientName: string;
  packageName: string;
}) {
  await createAdminBookingNotifications({
    booking_id: bookingId,
    message: `${clientName} cancelled a ${packageName} booking.`,
    title: 'Booking cancelled',
  });
}

export async function createAdminBookingRescheduledNotifications({
  bookingId,
  clientName,
  packageName,
}: {
  bookingId: string;
  clientName: string;
  packageName: string;
}) {
  await createAdminBookingNotifications({
    booking_id: bookingId,
    message: `${clientName} requested a new schedule for a ${packageName} booking.`,
    title: 'Booking rescheduled',
  });
}

async function createAdminBookingNotifications({
  booking_id: bookingId,
  message,
  title,
}: {
  booking_id: string;
  message: string;
  title: string;
}) {
  if (!supabase) return;

  const { error } = await supabase.rpc('create_admin_booking_notification', {
    p_booking_id: bookingId,
    p_message: message,
    p_title: title,
  });

  if (!error) {
    return;
  }

  await createAdminBookingNotificationsFallback({
    bookingId,
    message,
    title,
  });
}

async function createAdminBookingNotificationsFallback({
  bookingId,
  message,
  title,
}: AdminNotificationValues) {
  if (!supabase) return;

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  const notifications = (admins ?? []).map((admin) => ({
    booking_id: bookingId,
    message,
    title,
    user_id: admin.id,
  }));

  if (notifications.length) {
    await supabase.from('notifications').insert(notifications);
  }
}

export async function createClientBookingStatusNotification({
  bookingDate,
  bookingId,
  clientId,
  endTime,
  notes,
  packageName,
  rejectionReason,
  startTime,
  status,
}: {
  bookingDate?: string;
  bookingId: string;
  clientId: string;
  endTime?: string;
  notes?: string | null;
  packageName: string;
  rejectionReason?: string | null;
  startTime?: string;
  status: 'completed' | 'confirmed' | 'rejected';
}) {
  if (!supabase) return;

  const confirmationMessage =
    status === 'confirmed'
      ? await buildConfirmedBookingMessage({
          bookingDate,
          endTime,
          notes,
          packageName,
          startTime,
        })
      : null;
  const messageByStatus = {
    completed: `Your ${packageName} booking has been marked completed. Thank you for booking with PhotoSync.`,
    confirmed: confirmationMessage ?? `Your ${packageName} booking request has been confirmed.`,
    rejected: rejectionReason
      ? `Your ${packageName} booking request has been rejected. Reason: ${rejectionReason}`
      : `Your ${packageName} booking request has been rejected.`,
  };
  const titleByStatus = {
    completed: 'Booking completed',
    confirmed: 'Booking confirmed',
    rejected: 'Booking rejected',
  };

  await supabase.from('notifications').insert({
    booking_id: bookingId,
    message: messageByStatus[status],
    title: titleByStatus[status],
    user_id: clientId,
  });
}

async function buildConfirmedBookingMessage({
  bookingDate,
  endTime,
  notes,
  packageName,
  startTime,
}: {
  bookingDate?: string;
  endTime?: string;
  notes?: string | null;
  packageName: string;
  startTime?: string;
}) {
  const settings = await getStudioSettings();
  const sessionDetails = parseSessionDetails(notes);
  const messageParts = [`Your ${packageName} booking has been confirmed.`];

  if (bookingDate && startTime && endTime) {
    messageParts.push(`Schedule: ${formatNotificationDate(bookingDate)}, ${formatNotificationTimeRange(startTime, endTime)}.`);
  }

  if (sessionDetails.location) {
    messageParts.push(`Location: ${sessionDetails.location}.`);
  }

  const studioContact = settings.contactPhone || settings.contactEmail;

  if (studioContact) {
    messageParts.push(`For changes, contact ${studioContact}.`);
  }

  return messageParts.join(' ');
}

function parseSessionDetails(notes?: string | null) {
  const result = {
    location: '',
  };

  if (!notes?.trim()) {
    return result;
  }

  notes.split('\n').forEach((line) => {
    const [rawLabel, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();

    if (rawLabel.trim().toLowerCase() === 'shoot location') {
      result.location = value;
    }
  });

  return result;
}

function formatNotificationDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function formatNotificationTimeRange(startTime: string, endTime: string) {
  return `${formatNotificationTime(startTime)} - ${formatNotificationTime(endTime)}`;
}

function formatNotificationTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export async function getMyNotifications(limit = 10): Promise<PhotoSyncNotification[]> {
  if (!supabase) {
    return [];
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return [];
  }

  await ensureBookingReminderNotifications({ expectedAccountId: userData.user.id });

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, booking_id, title, message, is_read, created_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as NotificationRow[]).map((row) => ({
    bookingId: row.booking_id,
    createdAt: row.created_at,
    id: row.id,
    isRead: row.is_read,
    message: row.message,
    title: row.title,
    userId: row.user_id,
  }));
}

export async function getMyUnreadNotificationCount({ throwOnError = false }: { throwOnError?: boolean } = {}) {
  if (!supabase) {
    if (throwOnError) throw new Error('Notifications are not connected yet.');
    return 0;
  }

  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (throwOnError && (authError || !userData.user)) throw new Error('Please sign in again to see your notifications.');

  if (!userData.user) {
    return 0;
  }

  await ensureBookingReminderNotifications({ expectedAccountId: userData.user.id });

  try {
    return await getUnreadCountForUser(userData.user.id);
  } catch (error) {
    if (throwOnError) throw error;
    return 0;
  }
}

async function getUnreadCountForUser(userId: string) {
  const { count, error } = await supabase!
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;

  return count ?? 0;
}

// Fetch unread items on the server so older unread updates are not hidden by
// the recent-items limit. The separate count covers the entire inbox.
export async function getMyNotificationInbox(
  filter: NotificationFilter,
  limit: number,
  readUnreadCount?: (load: () => Promise<number>) => Promise<number>,
  cursor?: NotificationCursor | null,
): Promise<NotificationInbox> {
  if (!supabase) throw new Error('Notifications are not connected yet.');

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error('Please sign in again to see your notifications.');
  const userId = data.user.id;

  if (!cursor) await ensureBookingReminderNotifications({ expectedAccountId: userId });
  const pageSize = Math.min(30, Math.max(1, Math.floor(limit)));
  let query = supabase.from('notifications')
    .select('id, user_id, booking_id, title, message, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);
  if (filter === 'unread') query = query.eq('is_read', false);
  if (cursor) {
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.createdAt)
      || !Number.isFinite(Date.parse(cursor.createdAt))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) {
      throw new Error('Invalid notification page cursor.');
    }
    query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
  }

  const [feed, unread] = await Promise.all([
    query,
    readUnreadCount ? readUnreadCount(() => getUnreadCountForUser(userId)) : getUnreadCountForUser(userId),
  ]);
  if (feed.error) throw feed.error;

  const rows = ((feed.data ?? []) as NotificationRow[]).slice(0, pageSize);
  const hasMore = (feed.data?.length ?? 0) > pageSize;
  const lastRow = rows.at(-1);
  return {
    hasMore,
    nextCursor: hasMore && lastRow ? { createdAt: lastRow.created_at, id: lastRow.id } : null,
    unreadCount: unread,
    items: rows.map((row) => ({
      bookingId: row.booking_id,
      createdAt: row.created_at,
      id: row.id,
      isRead: row.is_read,
      message: row.message,
      title: row.title,
      userId: row.user_id,
    })),
  };
}

export async function markNotificationRead(id: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please login first.', success: false };
  }

  const { data: rpcUpdated, error: rpcError } = await supabase.rpc('mark_my_notification_read', {
    p_notification_id: id,
  });

  if (!rpcError) {
    return rpcUpdated ? { success: true } : { message: 'Notification was not found for this account.', success: false };
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userData.user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data) {
    return { message: 'Notification was not found for this account.', success: false };
  }

  return { success: true };
}

export async function markAllNotificationsRead() {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return { message: 'Please sign in again to update your notifications.', success: false };
  }

  // This function scopes the write to auth.uid() and returns its affected-row
  // count. A notification arriving afterward is a new unread item, not a failure.
  const { data: updatedCount, error: rpcError } = await supabase.rpc('mark_all_my_notifications_read');
  if (!rpcError) {
    return typeof updatedCount === 'number' && updatedCount >= 0
      ? { success: true }
      : { message: 'The server could not confirm the notification update.', success: false };
  }
  if (rpcError.code !== 'PGRST202' && rpcError.code !== '42883') {
    return { message: rpcError.message, success: false };
  }

  // Compatibility with projects that have only the single-notification RPC.
  // Snapshot every unread ID before writing, including those beyond the UI page.
  const accountId = userData.user.id;
  const ids: string[] = [];
  const batchSize = 200;
  let afterId: string | null = null;
  while (true) {
    let query = supabase.from('notifications').select('id')
      .eq('user_id', accountId).eq('is_read', false)
      .order('id', { ascending: true }).limit(batchSize);
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query;
    if (error) return { message: error.message, success: false };
    const page = (data ?? []) as { id: string }[];
    ids.push(...page.map((row) => row.id));
    if (page.length < batchSize) break;
    afterId = page[page.length - 1].id;
  }

  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const { data: current, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || current.user?.id !== accountId) {
      return { message: 'Your account changed. Please try again.', success: false };
    }
    const batch = ids.slice(offset, offset + batchSize);
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: true }).eq('user_id', accountId).in('id', batch).select('id');
    if (error && error.code !== '42501') return { message: error.message, success: false };
    const savedIds = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
    const unsaved = batch.filter((id) => !savedIds.has(id));

    // RLS may silently skip the direct update. Use the same account-scoped
    // function as tapping an individual notification, with bounded concurrency.
    for (let start = 0; start < unsaved.length; start += 5) {
      const results = await Promise.all(unsaved.slice(start, start + 5).map((id) =>
        supabase!.rpc('mark_my_notification_read', { p_notification_id: id })));
      const failed = results.find((result) => result.error || result.data !== true);
      if (failed) {
        return {
          message: failed.error?.message ?? 'The server could not save all notification updates. Please try again.',
          success: false,
        };
      }
    }
  }

  return { success: true };
}
