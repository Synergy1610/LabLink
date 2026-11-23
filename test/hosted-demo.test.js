import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createHostedDemo } from '../src/hosted-demo.js';

test('the hosted demo keeps sample bookings separate between browsers', async (t) => {
  const server = createHostedDemo().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  function browser() {
    const jar = new Map();
    return async (path, fields) => {
      const response = await fetch(base + path, {
        method: fields ? 'POST' : 'GET', body: fields && new URLSearchParams(fields),
        headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') },
        redirect: 'manual',
      });
      for (const header of response.headers.getSetCookie()) {
        assert.match(header, /; Secure;/i);
        const [name, value] = header.split(';')[0].split('=');
        jar.set(name, value);
      }
      return { response, html: await response.text() };
    };
  }

  const actor = browser();
  const visitor = browser();
  const field = (html, name) => html.match(new RegExp(`name="${name}"[^>]*value="([^"]+)"`))[1];
  async function signIn(request, persona) {
    const { html } = await request('/sign-in');
    assert.match(html, /No password needed/);
    const signIn = await request('/demo/sign-in', { persona, _csrf: field(html, '_csrf') });
    assert.equal(signIn.response.headers.get('location'), '/account');
  }

  const health = await actor('/healthz');
  assert.equal(health.html, 'ok');
  assert.deepEqual(health.response.headers.getSetCookie(), []);
  await signIn(actor, '2');
  const { html: form } = await actor('/requests?slot=1&sample=1');
  const request = await actor('/requests', {
    ...Object.fromEntries(['_csrf', 'slotId', 'deadlineDate', 'deadlineTime'].map((name) => [name, field(form, name)])),
    projectDetails: 'Browser A sandbox check',
  });
  assert.equal(request.response.status, 303);

  await signIn(actor, '3');
  assert.match((await actor('/faculty')).html, /Browser A sandbox check/);
  await signIn(visitor, '3');
  const queue = (await visitor('/faculty')).html;
  assert.match(queue, /Anika Rao/);
  assert.doesNotMatch(queue, /Browser A sandbox check/);
});
