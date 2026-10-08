// Integration check: supply credentials through environment variables only.
// Creates one disposable, confirmed account and fake token; sends no email or
// notification. The account is removed in finally, including after failures.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

async function verify() {
  const url = process.env.PUSH_VERIFY_SUPABASE_URL;
  const anonKey = process.env.PUSH_VERIFY_ANON_KEY;
  const serviceKey = process.env.PUSH_VERIFY_SERVICE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Push verification credentials are missing.');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, serviceKey, options);
  const client = createClient(url, anonKey, options);
  const probe = randomUUID().replaceAll('-', '');
  const email = `push-verify-${probe}@example.invalid`;
  const password = `${randomUUID()}Aa9!`;
  const fakeToken = `ExpoPushToken[verify-${probe}]`;
  let userId;
  function check(result, description) {
    if (result.error) throw new Error(`${description}: ${result.error.message}`);
    return result.data;
  }
  async function activeTokens() {
    return check(await admin.rpc('get_active_push_tokens_for_user', { p_user_id: userId }), 'Active registration lookup');
  }
  try {
    const created = check(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'Temporary push verification', username: `pushverify${probe}` },
    }), 'Temporary account creation');
    userId = created.user.id;
    const signedIn = check(await client.auth.signInWithPassword({ email, password }), 'Temporary sign-in');
    const accessToken = signedIn.session.access_token;
    const sessionId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).session_id;
    check(await client.rpc('register_my_push_token', { p_expo_push_token: fakeToken, p_platform: 'android' }), 'Registration');
    assert.equal((await activeTokens()).some((row) => row.expo_push_token === fakeToken && row.session_id === sessionId), true,
      'The real login must own its active registration');
    const forbidden = await client.rpc('get_active_push_tokens_for_user', { p_user_id: userId });
    assert.equal(Boolean(forbidden.error), true, 'Authenticated clients cannot enumerate delivery registrations');
    assert.equal(check(await client.rpc('unregister_my_push_session'), 'Explicit cleanup'), 1);
    assert.equal((await activeTokens()).length, 0);
    check(await client.rpc('register_my_push_token', { p_expo_push_token: fakeToken, p_platform: 'android' }), 'Re-registration');

    // Deliberately skip device cleanup: exercise the real auth service cascade.
    check(await client.auth.signOut(), 'Real auth sign-out');
    assert.equal((await activeTokens()).length, 0, 'Sign-out must remove the session from delivery');
    const remaining = check(await admin.from('push_tokens').select('id').eq('user_id', userId), 'Cascade check');
    assert.equal(remaining.length, 0, 'Real sign-out must delete the registered token');
    const late = await client.rpc('register_my_push_token', { p_expo_push_token: fakeToken, p_platform: 'android' })
      .setHeader('Authorization', `Bearer ${accessToken}`);
    assert.equal(Boolean(late.error), true, 'An old JWT must not recreate the ended session registration');
    console.log('PASS: real login registration, RPC permissions, explicit cleanup, sign-out without cleanup, and late-registration rejection.');
  } finally {
    if (userId) {
      check(await admin.auth.admin.deleteUser(userId), 'Temporary account removal');
      console.log('Temporary verification account removed. No notifications were sent.');
    }
  }
}

verify().catch((error) => { console.error(error.message); process.exitCode = 1; });
