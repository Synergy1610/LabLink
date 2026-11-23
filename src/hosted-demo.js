import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { openDatabase } from './db/index.js';
import { securityHeaders } from './http/security.js';

const cookieName = '__Host-lablink_sandbox';
const idleMs = 30 * 60_000;
const maxSandboxes = 32;
const gemini = { generate: async () => ({ ok: false, reason: 'not_configured' }) };

export function createHostedDemo({ requestLimit = 64 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  const sandboxes = new Map();

  function remove(id) {
    sandboxes.get(id).db.close();
    sandboxes.delete(id);
  }

  app.get('/healthz', (_req, res) => res.type('text').send('ok'));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { maxAge: '15m' }));
  app.use((req, res) => {
    const now = Date.now();
    for (const [id, sandbox] of sandboxes) {
      if (sandbox.lastSeen > now - idleMs) break;
      remove(id);
    }

    const cookie = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`));
    const id = cookie?.slice(cookieName.length + 1);
    let sandbox = sandboxes.get(id);
    let sandboxId = id;
    if (!sandbox) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.redirect(303, '/sign-in');
      // Only public entry pages start a sandbox; missing asset/route probes do not.
      if (req.path !== '/' && req.path !== '/sign-in') return res.redirect(303, '/sign-in');
      if (sandboxes.size >= maxSandboxes) remove(sandboxes.keys().next().value);
      sandboxId = randomBytes(24).toString('hex');
      const db = openDatabase(':memory:');
      sandbox = { db, app: createApp({ db, authMode: 'demo', hostedDemo: true, gemini, requestLimit }) };
      res.cookie(cookieName, sandboxId, { secure: true, httpOnly: true, sameSite: 'strict', path: '/' });
    }
    sandbox.lastSeen = now;
    sandboxes.delete(sandboxId);
    sandboxes.set(sandboxId, sandbox);
    return sandbox.app(req, res);
  });

  return app;
}
