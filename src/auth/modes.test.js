import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import { openReviewDatabase } from '../db/review.js';
import { provisionAccount } from './credentials.js';

async function start(t, authMode, includeDemo, db = openDatabase(':memory:', { includeDemo })) {
  const server = createApp({ db, authMode }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, cookie = '', fields) => fetch(`${base}${path}`, {
    headers: { cookie }, redirect: 'manual', method: fields ? 'POST' : 'GET',
    body: fields ? new URLSearchParams(fields) : undefined,
  });
  return { db, request };
}

test('the public review logins use password auth with separate student and faculty access', async (t) => {
  const { db, request } = await start(t, 'normal', false, await openReviewDatabase());
  assert.equal(db.location(), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM requests').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);

  for (const [collegeId, password, allowed, forbidden] of [
    ['REVIEW-STUDENT', 'ReviewStudent26!', '/requests', '/faculty'],
    ['REVIEW-FACULTY', 'ReviewFaculty26!', '/faculty', '/requests'],
  ]) {
    const form = await request('/sign-in');
    const cookie = readCookie(form);
    assert.doesNotMatch(await form.clone().text(), /\/demo\/sign-in/);
    const _csrf = await readCsrf(form);
    const login = await request('/sign-in', cookie, { collegeId, password, _csrf });
    assert.equal(login.status, 303);
    const session = readCookie(login);
    assert.equal((await request(allowed, session)).status, 200);
    assert.equal((await request(forbidden, session)).status, 403);
  }
});

function readCookie(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

async function readCsrf(response) {
  const match = (await response.text()).match(/name="_csrf" value="([0-9a-f]{64})"/);
  assert.ok(match);
  return match[1];
}

test('normal mode uses provisioned accounts, never trusts a submitted role and throttles attempts', async (t) => {
  const { db, request } = await start(t, 'normal', false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM requests').get().count, 0);
  const password = randomBytes(16).toString('hex');
  await provisionAccount(db, { collegeId: 'lab-001', password, displayName: 'Lab Student', role: 'student' });
  const stored = db.prepare('SELECT * FROM credentials').get();
  assert.equal(stored.college_id, 'LAB-001');
  assert.notEqual(stored.password_hash, password);
  assert.match(stored.salt, /^[0-9a-f]{32}$/);

  const form = await request('/sign-in');
  const cookie = readCookie(form);
  const loginHtml = await form.clone().text();
  assert.match(loginHtml, /name="collegeId"/);
  assert.doesNotMatch(loginHtml, /Try as Faculty|\/demo\/sign-in/);
  const _csrf = await readCsrf(form);
  const fields = { collegeId: 'Lab-001', password, _csrf, role: 'faculty' };
  assert.equal((await request('/demo/sign-in', cookie, { _csrf, persona: '3' })).status, 404);
  assert.equal((await request('/sign-in', cookie, { ...fields, password: randomBytes(16).toString('hex') })).status, 401);
  const signedIn = await request('/sign-in', cookie, fields);
  assert.equal(signedIn.status, 303);
  const authenticated = readCookie(signedIn);
  assert.notEqual(authenticated, cookie);
  assert.equal((await request('/faculty', authenticated)).status, 403);
  const catalog = await request('/catalog', authenticated);
  assert.equal(catalog.status, 200);
  const catalogHtml = await catalog.text();
  const photos = [...catalogHtml.matchAll(/src="\/equipment\/([a-z]+\.webp)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(photos, ['analyzer', 'caliper', 'generator', 'kit', 'oscilloscope', 'printer', 'solder', 'supply', 'workstation'].map((file) => `${file}.webp`));
  assert.match(catalogHtml, /Representative photos/);
  assert.match(catalogHtml, /Use filters/);
  assert.match(catalogHtml, /Find with AI/);
  assert.match(catalogHtml, /data-slot-dialog/);
  assert.doesNotMatch(catalogHtml, /Switch role/);

  const newForm = await request('/sign-in');
  const newCookie = readCookie(newForm);
  const newToken = await readCsrf(newForm);
  for (let i = 0; i < 6; i++) {
    assert.equal((await request('/sign-in', newCookie, { _csrf: newToken })).status, 401);
  }
  const limited = await request('/sign-in', newCookie, { ...fields, _csrf: newToken });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('demo persona switching rotates the session and cannot be used without CSRF', async (t) => {
  const { request } = await start(t, 'demo', true);
  const form = await request('/sign-in');
  const cookie = readCookie(form);
  const _csrf = await readCsrf(form);
  assert.equal((await request('/demo/sign-in', cookie, { persona: '2' })).status, 403);
  assert.equal((await request('/demo/sign-in', cookie, { _csrf, persona: '999' })).status, 400);
  const signedIn = await request('/demo/sign-in', cookie, { _csrf, persona: '2', role: 'faculty' });
  assert.equal(signedIn.status, 303);
  const student = readCookie(signedIn);
  assert.equal((await request('/faculty', student)).status, 403);
  const token = await readCsrf(await request('/account', student));
  const switched = await request('/demo/sign-in', student, { _csrf: token, persona: '3' });
  assert.equal(switched.status, 303);
  assert.equal((await request('/faculty', student)).status, 303);
  const faculty = readCookie(switched);
  assert.equal((await request('/faculty', faculty)).status, 200);
  assert.equal((await request('/requests', faculty)).status, 403);
});
