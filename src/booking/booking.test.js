import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../db/index.js';

async function bookingFlow(t, firstApproval) {
  const now = Date.UTC(2026, 10, 23, 12);
  const db = openDatabase(':memory:', { now });
  const aiRequests = [];
  let aiResult = { ok: true, text: 'The recommended request has <zero> viable alternatives.' };
  const app = createApp({
    db, clock: () => now, authMode: 'demo',
    gemini: { generate: async (input) => { aiRequests.push(input); return aiResult; } },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];
  async function csrfFrom(response) {
    const match = (await response.text()).match(/name="_csrf" value="([0-9a-f]{64})"/);
    assert.ok(match, `expected form token on ${response.url} (HTTP ${response.status})`);
    return match[1];
  }
  const request = (path, cookie = '', fields) => fetch(`${base}${path}`, {
    method: fields ? 'POST' : 'GET',
    body: fields ? new URLSearchParams(fields) : undefined,
    headers: { cookie },
    redirect: 'manual',
  });
  async function signIn(userId) {
    const form = await request('/sign-in');
    const session = await request('/demo/sign-in', cookieFrom(form), { persona: String(userId), _csrf: await csrfFrom(form) });
    assert.equal(session.status, 303);
    return cookieFrom(session);
  }

  const sam = await signIn(2);
  const guided = await request('/requests?slot=1&sample=1', sam);
  assert.equal(guided.status, 200);
  const guidedHtml = await guided.text();
  assert.match(guidedHtml, /Measure pulse timing from a sensor prototype/);
  assert.match(guidedHtml, /name="deadlineDate"[^>]*value="26\/11\/2026"/);
  assert.match(guidedHtml, /Thu, 26\/11\/2026/);
  assert.match(guidedHtml, /Tue, 24\/11\/2026 · 17:30–19:30 IST/);
  const catalog = await request('/catalog?q=Electrical%20Engineering', sam);
  assert.equal(catalog.status, 200);
  const catalogHtml = await catalog.text();
  assert.match(catalogHtml, /Digital Oscilloscope/);
  assert.match(catalogHtml, /src="\/equipment\/oscilloscope.webp"/);
  assert.match(catalogHtml, /3 available slots/);
  assert.doesNotMatch(catalogHtml, /CAD Workstation/);
  assert.match(catalogHtml, /href="\/requests\/choose\?resource=1"/);
  const filtered = await request('/catalog?q=power&lab=Electronics%20Lab', sam);
  const matches = await filtered.text();
  assert.match(matches, /Bench Power Supply/);
  assert.match(matches, /<h2 id="catalog-lab-0">Electronics Lab<\/h2>/);
  assert.match(matches, /<details class="equipment-details">\s*<summary aria-label="Details for Bench Power Supply">Details<\/summary>[\s\S]*?Capabilities:/);
  assert.match(matches, /src="\/equipment\/supply.webp"/);
  assert.match(matches, /<dialog id="slot-dialog"/);
  assert.doesNotMatch(matches, /Digital Oscilloscope|Microcontroller Prototyping Kit/);
  const availabilityPath = '/requests/choose?resource=1&format=json';
  const availability = await request(availabilityPath, sam);
  assert.equal(availability.status, 200);
  const payload = await availability.json();
  assert.equal(payload.name, 'Digital Oscilloscope');
  assert.deepEqual(payload.dates[0], { date: '24/11/2026', label: 'Tue, 24/11/2026', slots: [{ id: 1, label: '17:30–19:30 IST' }] });
  assert.equal((await request(availabilityPath)).status, 303);
  const picker = await request('/requests/choose?resource=1&date=24%2F11%2F2026', sam);
  assert.equal(picker.status, 200);
  const pickerHtml = await picker.text();
  assert.match(pickerHtml, /<option value="24\/11\/2026" selected>Tue, 24\/11\/2026<\/option>/);
  assert.match(pickerHtml, /<option value="1">17:30–19:30 IST<\/option>/); // Pending does not hold a slot.
  assert.doesNotMatch(pickerHtml.split('<template')[0], /<option value="2">/);

  const form = await request('/requests?slot=1', sam);
  assert.equal(form.status, 200);
  const fields = { _csrf: await csrfFrom(form), slotId: '1', projectDetails: 'Compare sensor signals' };
  const deadline = { deadlineDate: '27/11/2026', deadlineTime: '17:30' };
  assert.equal((await request('/requests', sam, { ...fields, deadlineDate: '24/11/2026', deadlineTime: '19:29' })).status, 400);
  assert.equal((await request('/requests', sam, { ...fields, ...deadline, slotId: '999' })).status, 404);
  const submitted = await request('/requests', sam, { ...fields, ...deadline, studentId: '1' });
  assert.equal(submitted.status, 303);
  assert.equal(db.prepare('SELECT deadline FROM requests WHERE id = 2').get().deadline, Date.UTC(2026, 10, 27, 12));
  const history = await (await request('/requests', sam)).text();
  assert.match(history, /Compare sensor signals/);
  assert.doesNotMatch(history, /student-built motor controller/);
  assert.match(history, /Pending/);
  assert.equal((await request('/faculty/requests/2/approve', sam, fields)).status, 403);

  const faculty = await signIn(3);
  const queue = await request('/faculty', faculty);
  assert.equal(queue.status, 200);
  const queueHtml = await queue.clone().text();
  assert.match(queueHtml, /Compare sensor signals/);
  assert.match(queueHtml, /student-built motor controller/);
  assert.match(queueHtml, /Recommended: Anika Rao/);
  assert.match(queueHtml, /fewest other available slots/);
  assert.match(queueHtml, /Viable alternatives before deadline:<\/strong> 0/);
  assert.match(queueHtml, /Viable alternatives before deadline:<\/strong> 2/);
  assert.match(queueHtml, /Tue, 24\/11\/2026 · 17:30–19:30 IST/);
  assert.match(queueHtml, /Faculty mode/);
  assert.equal((queueHtml.match(/src="\/student-avatar.svg"/g) ?? []).length, 2);
  assert.match(queueHtml, /class="candidate candidate-recommended"[\s\S]*?Anika Rao<\/h3>[\s\S]*?class="badge recommended">Recommended/);
  const decisionFields = { _csrf: await csrfFrom(queue) };
  if (firstApproval === 1) {
    assert.equal(aiRequests.length, 0); // Loading the queue does not call Gemini.
    const route = '/faculty/slots/1/explain';
    assert.equal((await request(route, sam, fields)).status, 403);
    assert.equal((await request(route, faculty, {})).status, 403);
    assert.equal(aiRequests.length, 0);

    const explained = await request(route, faculty, decisionFields);
    assert.equal(explained.status, 200);
    const html = await explained.text();
    assert.match(html, /Recommended: Anika Rao/);
    assert.match(html, /Gemini explanation:<\/strong> The recommended request has &lt;zero&gt; viable alternatives/);
    const [aiRequest] = aiRequests;
    assert.doesNotMatch(aiRequest.prompt, /Anika|Sam|controller|sensor|student_id|requestId/);
    const facts = JSON.parse(aiRequest.prompt);
    assert.equal(facts.reason, 'fewest_alternatives');
    assert.deepEqual(facts.contenders.map(({ viableAlternativeCount }) => viableAlternativeCount), [0, 2]);
    assert.equal(facts.contenders[0].earliestAlternative, null);
    assert.equal(facts.contenders[1].earliestAlternative.startsAt, 'Wed, 25/11/2026 · 17:30 IST');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);

    for (const reason of ['not_configured', 'timeout']) {
      aiResult = { ok: false, reason };
      const fallback = await request(route, faculty, decisionFields);
      assert.equal(fallback.status, 200);
      assert.match(await fallback.text(), /Use the rule-based explanation above/);
    }
  }
  const approve = (id) => request(`/faculty/requests/${id}/approve`, faculty, decisionFields);
  if (firstApproval) {
    assert.equal((await approve(firstApproval)).status, 303);
    assert.equal((await approve(firstApproval === 1 ? 2 : 1)).status, 409);
  } else {
    const decisions = await Promise.all([approve(1), approve(2)]);
    assert.deepEqual(decisions.map((response) => response.status).sort(), [303, 409]);
  }

  const booking = db.prepare('SELECT request_id, faculty_id FROM bookings').all();
  assert.equal(booking.length, 1);
  assert.equal(booking[0].faculty_id, 3);
  const approved = booking[0].request_id;
  const remaining = approved === 1 ? 2 : 1;
  const anika = await signIn(1);
  const winner = approved === 1 ? anika : sam;
  const other = approved === 1 ? sam : anika;
  assert.match(await (await request('/requests', winner)).text(), /Booking confirmed/);
  const otherHistory = await (await request('/requests', other)).text();
  assert.match(otherHistory, /now booked by another request/);
  assert.equal((await request(`/requests?alternativeFor=${remaining}`, winner)).status, 404);
  if (remaining === 2) {
    assert.match(otherHistory, /Earliest alternative/);
    const alternate = await request('/requests?alternativeFor=2', sam);
    assert.equal(alternate.status, 200);
    const alternateHtml = await alternate.clone().text();
    assert.match(alternateHtml, /name="slotId" value="2"/);
    assert.match(alternateHtml, /name="deadlineDate"[^>]*value="27\/11\/2026"/);
    assert.match(alternateHtml, /name="deadlineTime"[^>]*value="17:30"/);
    assert.match(alternateHtml, /Compare sensor signals/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM requests').get().count, 2);
    assert.equal((await request('/requests', sam, {
      ...fields, ...deadline, _csrf: await csrfFrom(alternate), slotId: '2',
    })).status, 303);
    assert.equal(db.prepare('SELECT status FROM requests WHERE id = 2').get().status, 'pending');
    assert.equal(db.prepare('SELECT status FROM requests WHERE id = 3').get().status, 'pending');
  } else {
    assert.match(otherHistory, /No available alternative/);
    assert.equal((await request('/requests?alternativeFor=1', anika)).status, 409);
  }
  assert.equal((await request(`/faculty/requests/${remaining}/decline`, faculty, decisionFields)).status, 303);
  assert.match(await (await request('/requests', other)).text(), /Declined/);
}

test('faculty can accept the recommendation and the other student can request an alternative', (t) => bookingFlow(t, 1));
test('faculty can override the recommendation and the other student sees when no alternative exists', (t) => bookingFlow(t, 2));
test('competing faculty approvals cannot double-book a slot', (t) => bookingFlow(t, null));
