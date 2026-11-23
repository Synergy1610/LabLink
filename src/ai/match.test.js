import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import { matchEquipment } from './match.js';

test('equipment matching discards unknown or duplicate IDs and uses canonical names', async () => {
  const catalog = [{ id: 1, name: 'Oscilloscope', capabilities: 'Signal timing', slots: ['private slot data'] }];
  const gemini = { generate: async ({ prompt }) => {
    assert.equal(JSON.parse(prompt).project, 'Measure pulse timing');
    assert.doesNotMatch(prompt, /private slot data/);
    return { ok: true, text: JSON.stringify([
      { resourceId: 99, reason: 'Invented device' },
      { resourceId: 1, name: 'Invented name', reason: ' Shows pulse timing. ' },
      { resourceId: 1, reason: 'Duplicate' },
    ]) };
  } };
  assert.deepEqual(await matchEquipment(gemini, 'Measure pulse timing', catalog), {
    ok: true, matches: [{ resourceId: 1, name: 'Oscilloscope', reason: 'Shows pulse timing.' }],
  });
  const invalid = { generate: async () => ({ ok: true, text: '[{"resourceId":99,"reason":"Invented"}]' }) };
  assert.deepEqual(await matchEquipment(invalid, 'Measure pulse timing', catalog), { ok: false, reason: 'invalid_response' });
});

test('catalog matching renders known results and preserves search when Gemini is unavailable', async (t) => {
  let calls = 0;
  let result = { ok: true, text: '[{"resourceId":1,"reason":"Measure pulses <b>directly</b>."}]' };
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    authMode: 'demo',
    gemini: { generate: async () => { calls++; return result; } },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = (response) => response.headers.get('set-cookie').split(';')[0];
  const token = (html) => html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1];
  const post = (route, session, fields) => fetch(`${base}${route}`, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields), redirect: 'manual',
  });

  const signIn = await fetch(`${base}/sign-in`);
  const auth = await post('/demo/sign-in', cookie(signIn), { persona: '2', _csrf: token(await signIn.text()) });
  assert.equal(auth.status, 303);
  const session = cookie(auth);
  const catalog = await fetch(`${base}/catalog`, { headers: { cookie: session } });
  const _csrf = token(await catalog.text());
  const match = (project) => post('/catalog/match', session, { project, _csrf });
  assert.equal((await match('x'.repeat(601))).status, 400);
  assert.equal((await post('/catalog/match', session, { project: 'Measure pulses' })).status, 403);
  assert.equal(calls, 0);

  const successful = await match('Measure pulses');
  assert.equal(successful.status, 200);
  const html = await successful.text();
  assert.match(html, /<h2 id="gemini-heading">Find equipment with Gemini<\/h2>/);
  assert.match(html, /data-catalog-panel="catalog-ai" data-show-on-load/);
  assert.match(html, /<strong>Digital Oscilloscope<\/strong>/);
  assert.match(html, /href="#resource-1" aria-label="View equipment: Digital Oscilloscope">View equipment<\/a>/);
  assert.match(html, /Measure pulses &lt;b&gt;directly&lt;\/b&gt;/);
  assert.match(html, /href="\/requests\/choose\?resource=1"/);

  const filteredMatch = await post('/catalog/match', session, { project: 'Measure pulses', q: 'CAD', _csrf });
  const filteredHtml = await filteredMatch.text();
  assert.match(filteredHtml, /Filters: “CAD”/);
  assert.match(filteredHtml, /href="\/catalog#resource-1"/);
  assert.doesNotMatch(filteredHtml, /id="resource-1"/);

  for (const [reason, message] of [
    ['not_configured', /Gemini is not configured/],
    ['timeout', /Gemini took too long to respond/],
    ['rate_limited', /Gemini is rate-limited/],
    ['invalid_response', /response LabLink could not use/],
    ['provider_error', /could not get a response from Gemini/],
  ]) {
    result = { ok: false, reason };
    const fallback = await match('Measure pulses');
    assert.equal(fallback.status, 200);
    const fallbackHtml = await fallback.text();
    assert.match(fallbackHtml, message);
    assert.match(fallbackHtml, /You can still search the catalog below/);
  }

  const search = await fetch(`${base}/catalog?q=workstation`, { headers: { cookie: session } });
  assert.match(await search.text(), /CAD Workstation/);
  assert.equal(calls, 7);
});
