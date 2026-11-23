// LabLink accepts Indian Standard Time (UTC+05:30) and stores epoch milliseconds.
const istOffsetMs = 330 * 60_000;
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDeadlineFields(time) {
  const iso = new Date(time + istOffsetMs).toISOString();
  const [year, month, day] = iso.slice(0, 10).split('-');
  return { deadlineDate: `${day}/${month}/${year}`, deadlineTime: iso.slice(11, 16) };
}

export function formatTime(time) {
  return `${formatDateLabel(time)} · ${formatDeadlineFields(time).deadlineTime} IST`;
}

export function formatDateLabel(time) {
  const weekday = weekdays[new Date(time + istOffsetMs).getUTCDay()];
  return `${weekday}, ${formatDeadlineFields(time).deadlineDate}`;
}

export function formatSlotRange(start, end, { includeDate = true } = {}) {
  const from = formatDeadlineFields(start);
  const to = formatDeadlineFields(end);
  if (from.deadlineDate !== to.deadlineDate) {
    return `${formatDateLabel(start)} · ${from.deadlineTime} to ${formatDateLabel(end)} · ${to.deadlineTime} IST`;
  }
  const date = includeDate ? `${formatDateLabel(start)} · ` : '';
  return `${date}${from.deadlineTime}–${to.deadlineTime} IST`;
}

export function readDeadline(date, time) {
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!parts || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  const [, day, month, year] = parts;
  const timestamp = Date.parse(`${year}-${month}-${day}T${time}:00+05:30`);
  if (!Number.isFinite(timestamp) || formatDeadlineFields(timestamp).deadlineDate !== date) return null;
  return timestamp;
}
