export const defaultGeminiModel = 'gemini-3.5-flash-lite';

const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

// Server-only. Failures return safe codes, not provider payloads or secrets.
export function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
} = {}) {
  const key = apiKey?.trim();
  const modelId = model?.trim() || defaultGeminiModel;

  async function generate({ instruction, prompt, responseSchema }) {
    if (!key) return { ok: false, reason: 'not_configured' };
    if (!/^gemini-[a-z0-9][a-z0-9.-]{0,79}$/.test(modelId)) return { ok: false, reason: 'invalid_model' };

    const signal = AbortSignal.timeout(timeoutMs);
    const generationConfig = { maxOutputTokens: 768 };
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = responseSchema;
    }

    try {
      const response = await fetchImpl(`${endpoint}/${modelId}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, reason: response.status === 429 ? 'rate_limited' : 'provider_error' };
      }

      const payload = await response.json();
      const candidate = payload?.candidates?.[0];
      if (candidate?.finishReason !== 'STOP' || !Array.isArray(candidate.content?.parts)) {
        return { ok: false, reason: 'invalid_response' };
      }
      const text = candidate.content.parts
        .filter((part) => part && !part.thought && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
        .trim();
      return text ? { ok: true, text } : { ok: false, reason: 'invalid_response' };
    } catch (error) {
      if (signal.aborted) return { ok: false, reason: 'timeout' };
      return { ok: false, reason: error instanceof SyntaxError ? 'invalid_response' : 'provider_error' };
    }
  }

  return { generate };
}
