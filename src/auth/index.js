import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { verifyCredentials } from './credentials.js';

const cookieName = 'lablink_session';
const sessionTtl = 4 * 60 * 60 * 1000;
const maxSessions = 256;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function token() {
  return randomBytes(32).toString('hex');
}

function sessionId(req, name) {
  const cookie = (req.headers.cookie ?? '').split(';').find((part) => part.trim().startsWith(`${name}=`));
  const value = cookie?.trim().slice(name.length + 1);
  return /^[0-9a-f]{64}$/.test(value ?? '') ? value : undefined;
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(303, '/sign-in');
    if (role && req.user.role !== role) {
      return res.status(403).type('text').send('You do not have permission to access this page.');
    }
    return next();
  };
}

export function createAuth({ db, mode = 'normal', clock = Date.now, hostedDemo = false } = {}) {
  if (!['normal', 'demo'].includes(mode)) throw new Error('Unknown LabLink sign-in mode.');
  const demoMode = mode === 'demo';
  if (hostedDemo && !demoMode) throw new Error('Hosted access is only available for the demo.');
  if (demoMode && (!db || db.location() !== null)) throw new Error('Demo sign-in requires an in-memory database.');
  const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'strict', secure: hostedDemo || req.secure, path: '/' });
  const name = demoMode ? `${cookieName}_demo` : cookieName;
  const router = Router();
  const sessions = new Map();
  const demoUsers = new Map();
  let attempts = 0;
  let windowEnds = 0;

  if (demoMode) {
    const users = db.prepare(`
      SELECT u.id, u.display_name, u.role FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id) ORDER BY u.id
    `).all();
    for (const user of users) demoUsers.set(String(user.id), user);
  }

  function startSession(req, res, user = null) {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(id);
    }
    if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);

    const id = token();
    const session = { user, csrfToken: token(), expiresAt: now + sessionTtl };
    sessions.set(id, session);
    res.cookie(name, id, { ...cookieOptions(req), maxAge: sessionTtl });
    return session;
  }

  function loadSession(req, res, next) {
    const id = sessionId(req, name);
    const session = sessions.get(id);
    if (session && session.expiresAt <= Date.now()) sessions.delete(id);
    req.session = sessions.get(id) ?? null;
    req.user = req.session?.user ?? null;
    res.locals.currentUser = req.user;
    res.locals.csrfToken = req.session?.csrfToken ?? null;
    res.locals.demoMode = demoMode;
    res.locals.personas = [...demoUsers.values()];
    res.set('Cache-Control', 'no-store');
    next();
  }

  function verifyCsrf(req, res, next) {
    if (safeMethods.has(req.method)) return next();
    const provided = req.body?._csrf;
    const expected = req.session?.csrfToken;
    if (expected && typeof provided === 'string' && /^[0-9a-f]{64}$/.test(provided)
      && timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))) {
      return next();
    }
    return res.status(403).type('text').send('This form could not be verified. Reopen the page and try again.');
  }

  function showLogin(req, res, status = 200, error = null) {
    const session = req.session ?? startSession(req, res);
    return res.status(status).render('auth/sign-in', { csrfToken: session.csrfToken, error });
  }

  router.get('/sign-in', (req, res) => {
    if (req.user && !demoMode) return res.redirect(303, '/account');
    return showLogin(req, res);
  });

  function signIn(req, res, user) {
    // Rotate the anonymous session and CSRF token on sign-in.
    sessions.delete(sessionId(req, name));
    startSession(req, res, user);
    return res.redirect(303, '/account');
  }

  if (!demoMode && db) router.post('/sign-in', async (req, res) => {
    if (req.user) return res.redirect(303, '/account');
    // One shared limit for this loopback instance, independent of cookies or IDs.
    const now = clock();
    if (now >= windowEnds) {
      attempts = 0;
      windowEnds = now + 60_000;
    }
    if (attempts >= 8) {
      res.set('Retry-After', String(Math.ceil((windowEnds - now) / 1000)));
      return showLogin(req, res, 429, 'Too many sign-in attempts. Try again in a minute.');
    }
    attempts++;
    const user = await verifyCredentials(db, req.body?.collegeId, req.body?.password);
    if (!user) return showLogin(req, res, 401, 'The college ID or password is incorrect.');
    return signIn(req, res, user);
  });

  if (demoMode) router.post('/demo/sign-in', (req, res) => {
    if (!hostedDemo && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.sendStatus(404);
    const user = demoUsers.get(req.body?.persona);
    if (!user) return showLogin(req, res, 400, 'Choose a listed demo persona.');
    return signIn(req, res, user);
  });

  router.get('/account', requireRole(), (_req, res) => res.render('auth/account'));

  router.post('/sign-out', requireRole(), (req, res) => {
    sessions.delete(sessionId(req, name));
    res.clearCookie(name, cookieOptions(req));
    return res.redirect(303, '/');
  });

  return { router, loadSession, verifyCsrf };
}
