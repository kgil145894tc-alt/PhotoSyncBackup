const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function setup({ tokens = [], tokenFailure = false } = {}) {
  let handler;
  const requests = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../supabase/functions/send-push-notification/index.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: {}, Response, JSON, console: { log: () => {} }, Deno: {
    serve: (callback) => { handler = callback; },
    env: { get: (key) => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', PUSH_WEBHOOK_SECRET: 'test-secret' })[key] },
  }, fetch: async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/rest/v1/notifications?')) return Response.json([{ id: 'n1', user_id: 'account-a', booking_id: 'b1', title: 'Booking confirmed', message: 'Your booking is confirmed.' }]);
    if (url.includes('/rpc/get_active_push_tokens_for_user')) return tokenFailure ? new Response('Offline', { status: 503 }) : Response.json(tokens);
    if (url === 'https://exp.host/--/api/v2/push/send') return Response.json({ data: [{ status: 'ok' }] });
    throw new Error(`Unexpected request: ${url}`);
  } });
  return { requests, invoke: (secret = 'test-secret') => handler(new Request('https://test/function', {
    method: 'POST', headers: { 'x-photosync-webhook-secret': secret }, body: JSON.stringify({ notification_id: 'n1' }),
  })) };
}

test('Push delivery reads only session-validated registrations and labels the recipient in its payload', async () => {
  const { invoke, requests } = setup({ tokens: [{ expo_push_token: 'ExpoPushToken[test]', session_id: 'session-a' }] });
  assert.equal((await invoke()).status, 200);
  assert.equal(requests.length, 3);
  assert.ok(requests[1].url.endsWith('/rpc/get_active_push_tokens_for_user'));
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[1].options.body), { p_user_id: 'account-a' });
  const message = JSON.parse(requests[2].options.body)[0];
  assert.equal(message.to, 'ExpoPushToken[test]');
  assert.equal(message.data.userId, 'account-a');
  assert.equal(message.data.sessionId, 'session-a');
  assert.equal(message.data.url, '/book');
});

test('Missing or failed active-session lookups never fall back to sending to stale tokens', async () => {
  for (const tokenFailure of [false, true]) {
    const { invoke, requests } = setup({ tokenFailure });
    const response = await invoke();
    assert.equal(response.status, tokenFailure ? 500 : 200);
    assert.equal(requests.length, 2);
    if (!tokenFailure) assert.equal((await response.json()).sent, 0);
  }
});

test('The existing webhook secret remains required before reading or sending any push', async () => {
  const { invoke, requests } = setup();
  assert.equal((await invoke('incorrect')).status, 401);
  assert.equal(requests.length, 0);
});
