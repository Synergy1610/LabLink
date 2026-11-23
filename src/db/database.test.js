import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDatabase } from './index.js';

const now = Date.UTC(2026, 0, 1);

test('demo data has future, non-overlapping slots and a request with no viable alternative', (t) => {
  const db = openDatabase(':memory:', { now });
  t.after(() => db.close());

  assert.equal(db.prepare('SELECT COUNT(DISTINCT department) AS count FROM resources').get().count, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').get('student').count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').get('faculty').count, 1);
  const slots = db.prepare('SELECT * FROM slots ORDER BY resource_id, starts_at').all();
  assert.equal(slots.length, 7);
  for (const [index, slot] of slots.entries()) {
    assert.ok(slot.starts_at > now);
    const previous = slots[index - 1];
    if (previous?.resource_id === slot.resource_id) assert.ok(previous.ends_at <= slot.starts_at);
  }

  const request = db.prepare('SELECT * FROM requests').get();
  const contested = slots.find((slot) => slot.id === request.slot_id);
  const alternatives = slots.filter((slot) => slot.resource_id === contested.resource_id && slot.id !== contested.id);
  assert.equal(request.status, 'pending');
  assert.ok(contested.ends_at <= request.deadline);
  assert.ok(alternatives.length > 0);
  assert.ok(alternatives.every((slot) => slot.ends_at > request.deadline));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);
});

test('SQLite rejects orphan references, mismatched bookings, and a second booking for the same slot', (t) => {
  const db = openDatabase(':memory:', { now });
  t.after(() => db.close());

  const addRequest = db.prepare(`
    INSERT INTO requests (student_id, slot_id, project_details, deadline, submitted_at)
    VALUES (?, ?, 'Demo project', ?, ?)
  `);
  assert.throws(() => addRequest.run(999, 1, now, now), /FOREIGN KEY/);
  const deadline = db.prepare('SELECT MAX(ends_at) AS deadline FROM slots').get().deadline;
  const competingId = addRequest.run(2, 1, deadline, now).lastInsertRowid;

  const book = db.prepare('INSERT INTO bookings (request_id, slot_id, faculty_id, approved_at) VALUES (?, ?, ?, ?)');
  assert.throws(() => book.run(1, 2, 3, now), /FOREIGN KEY/);
  book.run(1, 1, 3, now);
  assert.throws(() => book.run(competingId, 1, 3, now), /UNIQUE constraint failed: bookings.slot_id/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
});

test('reopening the same database preserves demo times and user changes without reseeding', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lablink-db-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'nested', 'lablink.sqlite');

  let startsAt;
  const first = openDatabase(path, { now });
  try {
    startsAt = first.prepare('SELECT starts_at FROM slots WHERE id = 1').get().starts_at;
    first.prepare("UPDATE requests SET status = 'declined' WHERE id = 1").run();
  } finally {
    first.close();
  }

  const reopened = openDatabase(path, { now: now + 60_000 });
  try {
    assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM slots').get().count, 7);
    assert.equal(reopened.prepare('SELECT starts_at FROM slots WHERE id = 1').get().starts_at, startsAt);
    assert.equal(reopened.prepare('SELECT status FROM requests WHERE id = 1').get().status, 'declined');
  } finally {
    reopened.close();
  }
});
