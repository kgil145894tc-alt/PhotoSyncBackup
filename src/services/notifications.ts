import { supabase } from '@/lib/supabase';
import { getStudioSettings } from '@/services/studio-settings';
import { type PhotoSyncNotification } from '@/types/notifications';

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

  await ensureBookingReminderNotifications();

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return [];
  }

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

export async function getMyUnreadNotificationCount() {
  if (!supabase) {
    return 0;
  }

  await ensureBookingReminderNotifications();

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return 0;
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userData.user.id)
    .eq('is_read', false);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function ensureBookingReminderNotifications() {
  if (!supabase) {
    return;
  }

  await supabase.rpc('ensure_booking_reminder_notifications');
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

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please login first.', success: false };
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userData.user.id)
    .eq('is_read', false);

  if (error) {
    return { message: error.message, success: false };
  }

  return { success: true };
}
