import { readDeadline } from './time.js';

export { formatTime } from './time.js';

export class BookingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function readId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function findCatalog(db, search, now, lab = '') {
  const rows = db.prepare(`
    SELECT r.*, s.id AS slot_id, s.starts_at, s.ends_at
    FROM resources r
    LEFT JOIN slots s ON s.resource_id = r.id AND s.starts_at > ?
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
    WHERE instr(lower(r.name || ' ' || r.category || ' ' || r.department || ' ' || r.lab), lower(?)) > 0
      AND (? = '' OR r.lab = ?)
    ORDER BY r.name, s.starts_at
  `).all(now, search, lab, lab);
  const resources = new Map();
  for (const { slot_id, starts_at, ends_at, ...resource } of rows) {
    if (!resources.has(resource.id)) resources.set(resource.id, { ...resource, slots: [] });
    if (slot_id !== null) resources.get(resource.id).slots.push({ id: slot_id, starts_at, ends_at });
  }
  return [...resources.values()];
}

export function findOpenResourceSlots(db, resourceId, now) {
  return db.prepare(`SELECT s.id, s.starts_at, s.ends_at FROM slots s
    WHERE s.resource_id = ? AND s.starts_at > ?
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
    ORDER BY s.starts_at`).all(resourceId, now);
}

export function findSlot(db, id) {
  return db.prepare(`
    SELECT s.*, r.name AS resource_name, r.department, b.id AS booking_id
    FROM slots s JOIN resources r ON r.id = s.resource_id
    LEFT JOIN bookings b ON b.slot_id = s.id
    WHERE s.id = ?
  `).get(id);
}

const requestDetails = `
  SELECT q.*, s.resource_id, s.starts_at, s.ends_at, r.name AS resource_name, r.department,
    u.display_name AS student_name, b.request_id AS booked_request_id
  FROM requests q JOIN slots s ON s.id = q.slot_id
  JOIN resources r ON r.id = s.resource_id JOIN users u ON u.id = q.student_id
  LEFT JOIN bookings b ON b.slot_id = s.id
`;

export function findStudentRequests(db, studentId) {
  return db.prepare(`${requestDetails} WHERE q.student_id = ? ORDER BY q.submitted_at DESC, q.id DESC`).all(studentId);
}

export function findPendingRequests(db) {
  return db.prepare(`${requestDetails} WHERE q.status = 'pending' ORDER BY q.submitted_at, q.id`).all();
}

function transaction(db, perform) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = perform();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function submitRequest(db, studentId, slotId, fields, clock) {
  const { projectDetails, requirements } = fields;
  const deadline = readDeadline(fields.deadlineDate, fields.deadlineTime);
  if (!projectDetails || projectDetails.length > 600 || requirements.length > 300 || deadline === null) {
    throw new BookingError(400, 'Enter a project description (up to 600 characters), a valid deadline date (DD/MM/YYYY) and time in IST, and at most 300 characters of requirements.');
  }

  return transaction(db, () => {
    const now = clock();
    const slot = findSlot(db, slotId);
    if (!slot) throw new BookingError(404, 'That slot does not exist.');
    if (slot.starts_at <= now || slot.booking_id !== null) {
      throw new BookingError(409, 'That slot is no longer available. Choose another from the catalog.');
    }
    if (slot.ends_at > deadline) throw new BookingError(400, 'The project deadline must be at or after the end of the slot.');

    return db.prepare(`
      INSERT INTO requests (student_id, slot_id, project_details, deadline, requirements, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, slotId, projectDetails, deadline, requirements, now).lastInsertRowid;
  });
}

export function decideRequest(db, facultyId, requestId, decision, clock) {
  if (decision !== 'approved' && decision !== 'declined') throw new Error('Invalid booking decision.');
  return transaction(db, () => {
    const request = db.prepare(`${requestDetails} WHERE q.id = ?`).get(requestId);
    if (!request) throw new BookingError(404, 'Request not found.');
    if (request.status !== 'pending') throw new BookingError(409, 'This request has already been decided.');

    if (decision === 'approved') {
      const now = clock();
      if (request.booked_request_id !== null || request.starts_at <= now || request.ends_at > request.deadline) {
        throw new BookingError(409, 'This slot can no longer be approved for this request.');
      }
      db.prepare(`
        INSERT INTO bookings (request_id, slot_id, faculty_id, approved_at) VALUES (?, ?, ?, ?)
      `).run(request.id, request.slot_id, facultyId, now);
    }

    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(decision, request.id);
  });
}
