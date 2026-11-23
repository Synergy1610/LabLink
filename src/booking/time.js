// LabLink accepts Indian Standard Time (UTC+05:30) and stores epoch milliseconds.
const istOffsetMs = 330 * 60_000;

export function formatDeadlineFields(time) {
  const iso = new Date(time + istOffsetMs).toISOString();
  const [year, month, day] = iso.slice(0, 10).split('-');
  return { deadlineDate: `${day}/${month}/${year}`, deadlineTime: iso.slice(11, 16) };
}

export function formatTime(time) {
  const { deadlineDate, deadlineTime } = formatDeadlineFields(time);
  return `${deadlineDate}, ${deadlineTime} IST`;
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
