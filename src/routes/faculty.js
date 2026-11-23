import { Router } from 'express';
import { explainRecommendation, explanationFacts } from '../ai/explain.js';
import { geminiFailureMessage } from '../ai/messages.js';
import { requireRole } from '../auth/index.js';
import { BookingError, decideRequest, findPendingRequests, formatTime, readId } from '../booking/index.js';
import { formatSlotRange } from '../booking/time.js';
import { rankSlotRequests } from '../scheduling/index.js';

const rankingReasons = {
  fewest_alternatives: 'This student has the fewest other available slots before their deadline.',
  earliest_deadline: 'Among students tied on alternatives, this student has the earliest deadline.',
  earliest_submission: 'Among students tied on alternatives and deadline, this request was submitted first.',
};

export function facultyRoutes(db, clock, gemini) {
  const router = Router();
  const faculty = requireRole('faculty');

  function showQueue(res, status = 200, error = null, explanation = null) {
    const now = clock();
    const groups = new Map();
    for (const request of findPendingRequests(db)) {
      if (!groups.has(request.slot_id)) groups.set(request.slot_id, []);
      groups.get(request.slot_id).push(request);
    }
    const slotGroups = [...groups].map(([slotId, requests]) => {
      const ranking = requests.length > 1 ? rankSlotRequests(db, slotId, now) : null;
      const winner = requests.find((request) => request.id === ranking?.recommendedRequestId);
      const recommendation = winner ? {
        winner,
        reason: rankingReasons[ranking.reason],
        counts: new Map(ranking.contenders.map((contender) => [contender.requestId, contender.alternativeCount])),
      } : null;
      const aiExplanation = explanation?.slotId === slotId && recommendation
        && explanation.snapshot === rankingSnapshot(ranking) ? explanation.result : null;
      return { requests, recommendation, aiExplanation };
    });
    if (explanation && !slotGroups.some((group) => group.aiExplanation)) {
      error = 'The recommendation changed while the explanation was being generated. Review the current queue.';
      status = 409;
    }
    return res.status(status).render('faculty/index', {
      slotGroups, formatTime, formatSlotRange, geminiFailureMessage, error, now,
    });
  }

  router.get('/faculty', faculty, (_req, res) => showQueue(res));

  router.post('/faculty/slots/:id/explain', faculty, async (req, res) => {
    const slotId = readId(req.params.id);
    if (slotId === null) return showQueue(res, 400, 'Invalid slot selection.');
    const ranking = rankSlotRequests(db, slotId, clock());
    if (ranking.recommendedRequestId === null) {
      return showQueue(res, 409, 'There is no current conflict recommendation for that slot.');
    }
    const snapshot = rankingSnapshot(ranking);
    const result = await explainRecommendation(gemini, explanationFacts(ranking));
    return showQueue(res, 200, null, { slotId, snapshot, result });
  });

  for (const [action, decision] of [['approve', 'approved'], ['decline', 'declined']]) {
    router.post(`/faculty/requests/:id/${action}`, faculty, (req, res) => {
      const requestId = readId(req.params.id);
      if (requestId === null) return showQueue(res, 400, 'Invalid request selection.');
      try {
        decideRequest(db, req.user.id, requestId, decision, clock);
        return res.redirect(303, '/faculty');
      } catch (error) {
        if (!(error instanceof BookingError)) throw error;
        return showQueue(res, error.status, error.message);
      }
    });
  }

  return router;
}

function rankingSnapshot(ranking) {
  return JSON.stringify(ranking);
}
