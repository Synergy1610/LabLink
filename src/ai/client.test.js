import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createGeminiClient, defaultGeminiModel } from './client.js';

const input = { instruction: 'Explain the given facts.', prompt: 'Two slots remain.' };
const apiKey = 'test-key-placeholder';

test('Gemini sends a server-side request with the configured model and optional JSON schema', async () => {
  const model = 'gemini-test-model';
  const responseSchema = { type: 'ARRAY', items: { type: 'INTEGER' } };
  const client = createGeminiClient({ apiKey, model, fetchImpl: async (url, options) => {
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-goog-api-key'], apiKey);
    assert.doesNotMatch(options.body, /test-key-placeholder/);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.systemInstruction.parts, [{ text: input.instruction }]);
    assert.deepEqual(body.contents[0].parts, [{ text: input.prompt }]);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(body.generationConfig.responseSchema, responseSchema);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Ignore' }, { text: '[1]' }] } }],
    });
  } });

  assert.deepEqual(await client.generate({ ...input, responseSchema }), { ok: true, text: '[1]' });
});

test('Gemini skips the network with missing credentials or an invalid model', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; };
  const unconfigured = createGeminiClient({ apiKey: ' ', fetchImpl });
  const invalid = createGeminiClient({ apiKey, model: '../../other-model', fetchImpl });
  assert.deepEqual(await unconfigured.generate(input), { ok: false, reason: 'not_configured' });
  assert.deepEqual(await invalid.generate(input), { ok: false, reason: 'invalid_model' });
  assert.equal(calls, 0);
});

test('Gemini classifies provider, rate-limit, and malformed or incomplete results', async () => {
  const cases = [
    [new Response('Provider internals', { status: 503 }), 'provider_error'],
    [new Response('', { status: 429 }), 'rate_limited'],
    [new Response('not JSON'), 'invalid_response'],
    [Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Partial' }] } }] }), 'invalid_response'],
    [Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Hidden' }] } }] }), 'invalid_response'],
  ];
  for (const [response, reason] of cases) {
    const client = createGeminiClient({ apiKey, model: '', fetchImpl: async (url) => {
      assert.ok(url.endsWith(`/${defaultGeminiModel}:generateContent`));
      return response;
    } });
    assert.deepEqual(await client.generate(input), { ok: false, reason });
  }
});

test('Gemini cancels a slow request and returns a timeout', async () => {
  const client = createGeminiClient({ apiKey, model: '', timeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    await delay(1_000, undefined, { signal });
    return Response.json({});
  } });
  assert.deepEqual(await client.generate(input), { ok: false, reason: 'timeout' });
});
