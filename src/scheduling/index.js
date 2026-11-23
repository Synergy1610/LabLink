function findOpenSlots(db, resourceId, excludedSlotId, now, deadline) {
  return db.prepare(`
    SELECT s.id, s.starts_at, s.ends_at
    FROM slots s
    WHERE s.resource_id = ? AND s.id <> ? AND s.starts_at > ? AND s.ends_at <= ?
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
    ORDER BY s.starts_at, s.id
  `).all(resourceId, excludedSlotId, now, deadline);
}

// Accepts a request record joined to its slot, as returned by findStudentRequests.
export function findAlternatives(db, request, now) {
  return findOpenSlots(db, request.resource_id, request.slot_id, now, request.deadline);
}

function compare(a, b) {
  return a.alternativeCount - b.alternativeCount
    || a.deadline - b.deadline
    || a.submittedAt - b.submittedAt
    || a.requestId - b.requestId;
}

function explainRanking(first, second) {
  if (first.alternativeCount !== second.alternativeCount) return 'fewest_alternatives';
  if (first.deadline !== second.deadline) return 'earliest_deadline';
  // IDs preserve insertion order if two submissions have the same timestamp.
  return 'earliest_submission';
}

function summarizeAlternatives(requests, slots) {
  // Sweep by deadline: each slot becomes eligible once. Track earliest start
  // separately, since a longer slot can start earlier but finish later.
  slots.sort((a, b) => a.ends_at - b.ends_at);
  requests.sort((a, b) => a.deadline - b.deadline);
  let count = 0;
  let earliest = null;
  return requests.map((request) => {
    while (count < slots.length && slots[count].ends_at <= request.deadline) {
      const slot = slots[count++];
      if (!earliest || slot.starts_at < earliest.starts_at
        || (slot.starts_at === earliest.starts_at && slot.id < earliest.id)) earliest = slot;
    }
    return {
      requestId: request.id,
      deadline: request.deadline,
      submittedAt: request.submitted_at,
      alternativeCount: count,
      earliestAlternative: earliest,
    };
  });
}

// Returns advisory facts only. An uncontested or unavailable slot has no recommendation.
export function rankSlotRequests(db, slotId, now) {
  const requests = db.prepare(`
    SELECT q.id, q.deadline, q.submitted_at, s.resource_id
    FROM requests q JOIN slots s ON s.id = q.slot_id
    WHERE q.slot_id = ? AND q.status = 'pending' AND s.starts_at > ? AND s.ends_at <= q.deadline
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
  `).all(slotId, now);

  if (requests.length === 0) return { contenders: [], recommendedRequestId: null, reason: null };

  const latestDeadline = requests.reduce((latest, request) => Math.max(latest, request.deadline), requests[0].deadline);
  const openSlots = findOpenSlots(db, requests[0].resource_id, slotId, now, latestDeadline);
  const contenders = summarizeAlternatives(requests, openSlots).sort(compare);

  const [first, second] = contenders;
  return {
    contenders,
    recommendedRequestId: second ? first.requestId : null,
    reason: second ? explainRanking(first, second) : null,
  };
}
