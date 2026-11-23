import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDeadlineFields, formatTime, readDeadline } from './time.js';

test('IST date formatting and deadline parsing round-trip across a UTC date boundary', () => {
  const utc = Date.UTC(2026, 11, 31, 20, 15);
  assert.equal(formatTime(utc), '01/01/2027, 01:45 IST');
  const { deadlineDate, deadlineTime } = formatDeadlineFields(utc);
  assert.equal(readDeadline(deadlineDate, deadlineTime), utc);
});

test('deadline parsing rejects impossible calendar dates and malformed times', () => {
  assert.equal(readDeadline('31/02/2026', '10:00'), null);
  assert.equal(readDeadline('2026-11-23', '10:00'), null);
  assert.equal(readDeadline('23/11/2026', '24:00'), null);
  assert.equal(readDeadline('29/02/2028', '05:30'), Date.UTC(2028, 1, 29));
});
