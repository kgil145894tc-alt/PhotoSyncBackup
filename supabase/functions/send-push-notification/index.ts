// @ts-nocheck

type PushTokenRow = {
  expo_push_token: string;
};

type NotificationRow = {
  booking_id: string | null;
  id: string;
  message: string;
  title: string;
  user_id: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-photosync-webhook-secret',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase environment is not configured.' }, 500);
  }

  if (webhookSecret && req.headers.get('x-photosync-webhook-secret') !== webhookSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  const notificationId = body?.notification_id ?? body?.record?.id;

  if (typeof notificationId !== 'string') {
    return json({ error: 'notification_id is required.' }, 400);
  }

  const notificationResponse = await fetch(
    `${supabaseUrl}/rest/v1/notifications?id=eq.${encodeURIComponent(notificationId)}&select=id,user_id,booking_id,title,message`,
    {
      headers: restHeaders(serviceRoleKey),
    },
  );

  if (!notificationResponse.ok) {
    return json({ error: await notificationResponse.text() }, 500);
  }

  const notifications = (await notificationResponse.json()) as NotificationRow[];
  const notification = notifications[0];

  if (!notification) {
    return json({ error: 'Notification not found.' }, 404);
  }

  const tokensResponse = await fetch(
    `${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${encodeURIComponent(notification.user_id)}&select=expo_push_token`,
    {
      headers: restHeaders(serviceRoleKey),
    },
  );

  if (!tokensResponse.ok) {
    return json({ error: await tokensResponse.text() }, 500);
  }

  const tokenRows = (await tokensResponse.json()) as PushTokenRow[];
  const messages = tokenRows.map(({ expo_push_token }) => ({
    body: notification.message,
    data: {
      bookingId: notification.booking_id,
      notificationId: notification.id,
      url: getNotificationUrl(notification),
    },
    sound: 'default',
    title: notification.title,
    to: expo_push_token,
  }));

  if (!messages.length) {
    return json({ sent: 0 });
  }

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(messages),
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const expoResult = await expoResponse.json().catch(() => null);

  if (!expoResponse.ok) {
    return json({ error: expoResult ?? 'Expo push request failed.' }, 502);
  }

  return json({ result: expoResult, sent: messages.length });
});

function getNotificationUrl(notification: NotificationRow) {
  const title = notification.title.toLowerCase();

  if (!notification.booking_id) {
    return '/notifications';
  }

  if (title.includes('new booking') || title.includes('cancel') || title.includes('rescheduled')) {
    return `/photographer/requests/${notification.booking_id}`;
  }

  return '/book';
}

function restHeaders(serviceRoleKey: string) {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
