import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import { requireRole } from './index.js';

function csrfFrom(html) {
  const match = html.match(/name="_csrf" value="([0-9a-f]{64})"/);
  assert.ok(match, 'form contains a CSRF token');
  return match[1];
}

function cookieFrom(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Strict/i);
  return header.split(';')[0];
}

test('demo sign-in rotates sessions, ignores submitted roles, and requires CSRF for sign-out', async (t) => {
  const db = openDatabase(':memory:');
  const app = createApp({ db, authMode: 'demo' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const get = (path, cookie = '') => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: { cookie }, redirect: 'manual',
  });
  const post = (path, cookie, fields) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: { cookie }, body: new URLSearchParams(fields), redirect: 'manual',
  });

  const anonymousAccount = await get('/account');
  assert.equal(anonymousAccount.status, 303);
  assert.equal(anonymousAccount.headers.get('location'), '/sign-in');

  const signIn = await get('/sign-in');
  const anonymousCookie = cookieFrom(signIn);
  const csrf = csrfFrom(await signIn.text());
  assert.equal((await post('/demo/sign-in', anonymousCookie, { persona: '1' })).status, 403);
  assert.equal((await post('/demo/sign-in', anonymousCookie, { persona: 'invalid', _csrf: csrf })).status, 400);

  const signedIn = await post('/demo/sign-in', anonymousCookie, { persona: '1', _csrf: csrf, role: 'faculty' });
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('location'), '/account');
  const cookie = cookieFrom(signedIn);
  assert.notEqual(cookie, anonymousCookie);
  assert.equal((await get('/account', anonymousCookie)).status, 303);
  const account = await get('/account', cookie);
  assert.equal(account.status, 200);
  assert.equal(account.headers.get('cache-control'), 'no-store');
  const html = await account.text();
  assert.match(html, /<h2>Anika Rao<\/h2>\s*<p class="muted">Student<\/p>/);
  assert.match(html, /src="\/student-avatar.svg"/);
  assert.doesNotMatch(html, /\(faculty\)/);
  assert.equal((await post('/sign-out', cookie, { _csrf: csrf })).status, 403);
  const signedOut = await post('/sign-out', cookie, { _csrf: csrfFrom(html) });
  assert.equal(signedOut.status, 303);
  assert.equal((await get('/account', cookie)).status, 303);
});

test('faculty guard authorizes only a faculty session', () => {
  const guard = requireRole('faculty');
  const result = (user) => guard({ user }, {
    redirect: (status, path) => [status, path],
    status: (status) => ({ type: () => ({ send: () => status }) }),
  }, () => 'allowed');

  assert.deepEqual(result(null), [303, '/sign-in']);
  assert.equal(result({ role: 'student' }), 403);
  assert.equal(result({ role: 'faculty' }), 'allowed');
});
