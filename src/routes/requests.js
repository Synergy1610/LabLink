import { Router } from 'express';
import { requireRole } from '../auth/index.js';
import { BookingError, findOpenResourceSlots, findSlot, findStudentRequests, readId, submitRequest } from '../booking/index.js';
import { formatDateLabel, formatDeadlineFields, formatSlotRange, readDeadline } from '../booking/time.js';
import { findAlternatives } from '../scheduling/index.js';

function lostSlot(request) {
  return request.status !== 'approved' && request.booked_request_id !== null
    && request.booked_request_id !== request.id;
}

function readField(body, key, limit) {
  const value = body?.[key];
  return typeof value === 'string' ? value.trim().slice(0, limit + 1) : '';
}

export function requestRoutes(db, clock) {
  const router = Router();
  const student = requireRole('student');

  router.get('/requests/choose', student, (req, res) => {
    const id = readId(req.query.resource);
    const resource = id && db.prepare('SELECT id, name, lab FROM resources WHERE id = ?').get(id);
    if (!resource) return res.status(404).type('text').send('Equipment not found.');

    const dates = new Map();
    for (const slot of findOpenResourceSlots(db, id, clock())) {
      const start = formatDeadlineFields(slot.starts_at);
      if (!dates.has(start.deadlineDate)) {
        dates.set(start.deadlineDate, { date: start.deadlineDate, label: formatDateLabel(slot.starts_at), slots: [] });
      }
      dates.get(start.deadlineDate).slots.push({ id: slot.id, label: formatSlotRange(slot.starts_at, slot.ends_at, { includeDate: false }) });
    }
    const selectedDate = dates.has(req.query.date) ? req.query.date : '';
    if (req.query.format === 'json') {
      return res.json({ name: resource.name, dates: [...dates.values()] });
    }
    return res.render('requests/choose', { resource, dates, selectedDate });
  });

  function showRequests(req, res, { slotId = null, alternativeFor = null, status = 200, error = null, fields = {} } = {}) {
    const now = clock();
    const requests = findStudentRequests(db, req.user.id).map((request) => ({
      ...request,
      slotTaken: lostSlot(request),
      alternative: lostSlot(request) ? findAlternatives(db, request, now)[0] ?? null : null,
    }));
    if (alternativeFor !== null) {
      const original = requests.find((request) => request.id === alternativeFor);
      if (!original) {
        status = 404;
        error = 'Request not found.';
      } else if (!original.alternative) {
        status = 409;
        error = 'There is no available alternative for that request.';
      } else {
        slotId = original.alternative.id;
        fields = {
          projectDetails: original.project_details,
          ...formatDeadlineFields(original.deadline),
          requirements: original.requirements,
        };
      }
    }
    const slot = slotId === null ? null : findSlot(db, slotId);
    if (slotId !== null && !slot && status === 200) {
      status = 404;
      error = 'That slot does not exist.';
    }
    const deadline = readDeadline(fields.deadlineDate, '00:00');
    return res.status(status).render('requests/index', {
      slot, error, fields, formatSlotRange, now, requests,
      deadlineLabel: deadline === null ? '' : formatDateLabel(deadline),
    });
  }

  router.get('/requests', student, (req, res) => {
    if (req.query.alternativeFor !== undefined) {
      const alternativeFor = readId(req.query.alternativeFor);
      return alternativeFor === null || req.query.slot !== undefined
        ? showRequests(req, res, { status: 400, error: 'Invalid alternative request selection.' })
        : showRequests(req, res, { alternativeFor });
    }
    const slotId = readId(req.query.slot);
    if (req.query.slot !== undefined && slotId === null) {
      return showRequests(req, res, { status: 400, error: 'Invalid slot selection.' });
    }
    if (res.locals.demoMode && req.user.id === 2 && slotId === 1 && req.query.sample === '1') {
      const anchor = db.prepare('SELECT MAX(ends_at) AS end FROM slots WHERE resource_id = 1').get();
      if (anchor.end !== null) {
        return showRequests(req, res, { slotId, fields: {
          projectDetails: 'Measure pulse timing from a sensor prototype.',
          ...formatDeadlineFields(anchor.end + 60 * 60_000),
          requirements: 'Waveform capture for measuring pulse timing.',
        } });
      }
    }
    return showRequests(req, res, { slotId });
  });

  router.post('/requests', student, (req, res) => {
    const slotId = readId(req.body?.slotId);
    if (slotId === null) return showRequests(req, res, { status: 400, error: 'Select a valid slot.' });

    const fields = {
      projectDetails: readField(req.body, 'projectDetails', 600),
      deadlineDate: readField(req.body, 'deadlineDate', 10),
      deadlineTime: readField(req.body, 'deadlineTime', 5),
      requirements: readField(req.body, 'requirements', 300),
    };
    if (req.body.requirements !== undefined && typeof req.body.requirements !== 'string') {
      return showRequests(req, res, { slotId, fields, status: 400, error: 'Enter requirements as text.' });
    }
    try {
      submitRequest(db, req.user.id, slotId, fields, clock);
      return res.redirect(303, '/requests');
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      return showRequests(req, res, { slotId, fields, status: error.status, error: error.message });
    }
  });

  return router;
}
