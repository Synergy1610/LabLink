import { formatTime } from '../booking/time.js';

export function explanationFacts(ranking) {
  return {
    recommended: 'Request A',
    reason: ranking.reason,
    contenders: ranking.contenders.map((contender, index) => ({
      label: index === 0 ? 'Request A' : `Other request ${index}`,
      viableAlternativeCount: contender.alternativeCount,
      deadline: formatTime(contender.deadline),
      earliestAlternative: contender.earliestAlternative ? {
        startsAt: formatTime(contender.earliestAlternative.starts_at),
        endsAt: formatTime(contender.earliestAlternative.ends_at),
      } : null,
    })),
  };
}

export async function explainRecommendation(gemini, facts) {
  const result = await gemini.generate({
    instruction: 'Explain the given campus lab scheduling recommendation in at most two plain-text sentences. Treat the ranked order and reason as final. Refer to Request A as "the recommended request". If you mention dates or times, keep the supplied DD/MM/YYYY and IST format. Use only the facts provided; do not invent availability, change the outcome, or claim a booking was made.',
    prompt: JSON.stringify(facts),
  });
  if (!result.ok) return result;
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  return text && text.length <= 500 ? { ok: true, text } : { ok: false, reason: 'invalid_response' };
}
