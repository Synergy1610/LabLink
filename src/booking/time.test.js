import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDeadlineFields, formatSlotRange, formatTime, readDeadline } from './time.js';

test('IST date formatting and deadline parsing round-trip across a UTC date boundary', () => {
  const utc = Date.UTC(2026, 11, 31, 20, 15);
  assert.equal(formatTime(utc), 'Fri, 01/01/2027 · 01:45 IST');
  const { deadlineDate, deadlineTime } = formatDeadlineFields(utc);
  assert.equal(readDeadline(deadlineDate, deadlineTime), utc);
});

test('slot ranges show one date for same-day times and both dates across IST midnight', () => {
  const start = readDeadline('24/11/2026', '17:30');
  const end = readDeadline('24/11/2026', '19:30');
  assert.equal(formatSlotRange(start, end), 'Tue, 24/11/2026 · 17:30–19:30 IST');
  assert.equal(formatSlotRange(start, end, { includeDate: false }), '17:30–19:30 IST');
  assert.equal(formatSlotRange(readDeadline('24/11/2026', '23:30'), readDeadline('25/11/2026', '00:30')),
    'Tue, 24/11/2026 · 23:30 to Wed, 25/11/2026 · 00:30 IST');
});

test('deadline parsing rejects impossible calendar dates and malformed times', () => {
  assert.equal(readDeadline('31/02/2026', '10:00'), null);
  assert.equal(readDeadline('2026-11-23', '10:00'), null);
  assert.equal(readDeadline('23/11/2026', '24:00'), null);
  assert.equal(readDeadline('29/02/2028', '05:30'), Date.UTC(2028, 1, 29));
});
