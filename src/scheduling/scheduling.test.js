import assert from 'node:assert/strict';
import test from 'node:test';
import { findStudentRequests } from '../booking/index.js';
import { openDatabase } from '../db/index.js';
import { findAlternatives, rankSlotRequests } from './index.js';

const now = Date.UTC(2026, 10, 23, 12);
const hour = 3_600_000;
const day = 24 * hour;

function fixture(t) {
  const db = openDatabase(':memory:', { now });
  t.after(() => db.close());
  return db;
}

function addRequest(db, { slotId = 1, deadline, submittedAt = now + 1, status = 'pending' }) {
  return db.prepare(`
    INSERT INTO requests (student_id, slot_id, project_details, deadline, submitted_at, status)
    VALUES (2, ?, 'Compare sensor signals', ?, ?, ?)
  `).run(slotId, deadline, submittedAt, status).lastInsertRowid;
}

test('fewer alternatives takes priority and ranking does not modify requests or reserve slots', (t) => {
  const db = fixture(t);
  assert.equal(rankSlotRequests(db, 1, now).recommendedRequestId, null);
  const sam = addRequest(db, { deadline: now + 4 * day, submittedAt: now - 1 });
  const result = rankSlotRequests(db, 1, now);

  assert.equal(result.recommendedRequestId, 1);
  assert.equal(result.reason, 'fewest_alternatives');
  assert.deepEqual(result.contenders.map((c) => [c.requestId, c.alternativeCount, c.earliestAlternative?.id]), [
    [1, 0, undefined], [sam, 2, 2],
  ]);
  assert.deepEqual(findAlternatives(db, findStudentRequests(db, 2)[0], now).map((s) => s.id), [2, 3]);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM requests WHERE status = 'pending'").get().count, 2);
});

test('equal counts use earliest deadline, then first submission', (t) => {
  const db = fixture(t);
  addRequest(db, { deadline: now + day + 5 * hour, submittedAt: now - 1 });
  assert.equal(rankSlotRequests(db, 1, now).recommendedRequestId, 1);
  assert.equal(rankSlotRequests(db, 1, now).reason, 'earliest_deadline');

  const sam = addRequest(db, { deadline: now + day + 4 * hour, submittedAt: now - 1 });
  assert.equal(rankSlotRequests(db, 1, now).recommendedRequestId, sam);
  assert.equal(rankSlotRequests(db, 1, now).reason, 'earliest_submission');
});

test('alternatives exclude bookings, other resources, the contested slot, and slots already starting', (t) => {
  const db = fixture(t);
  const addSlot = db.prepare('INSERT INTO slots (resource_id, starts_at, ends_at) VALUES (1, ?, ?)');
  addSlot.run(now, now + hour);
  const available = addSlot.run(now + 3 * hour, now + 4 * hour).lastInsertRowid;
  const later = addSlot.run(now + day + 5 * hour, now + day + 6 * hour).lastInsertRowid;

  const bookable = addRequest(db, { slotId: 2, deadline: now + 4 * day, status: 'approved' });
  const book = db.prepare('INSERT INTO bookings (request_id, slot_id, faculty_id, approved_at) VALUES (?, ?, 3, ?)');
  book.run(bookable, 2, now);
  addRequest(db, { slotId: available, deadline: now + day }); // Pending does not block an alternative.
  addRequest(db, { deadline: now + day + 4 * hour, status: 'declined' });
  addRequest(db, { deadline: now + day }); // Contested slot would end after this deadline.

  const request = findStudentRequests(db, 1)[0];
  assert.deepEqual(findAlternatives(db, request, now).map((slot) => slot.id), [available]);
  assert.deepEqual(findAlternatives(db, { ...request, deadline: now + 4 * hour }, now).map((slot) => slot.id), [available]);
  assert.deepEqual(findAlternatives(db, { ...request, deadline: now + 4 * day }, now).map((slot) => slot.id), [available, later, 3]);
  assert.deepEqual(rankSlotRequests(db, 1, now).contenders.map((c) => c.requestId), [1]);
  assert.deepEqual(rankSlotRequests(db, 1, now + day).contenders, []);
  assert.deepEqual(rankSlotRequests(db, 999, now).contenders, []);
  book.run(1, 1, now);
  assert.deepEqual(rankSlotRequests(db, 1, now).contenders, []);
});
