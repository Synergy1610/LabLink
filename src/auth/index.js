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

function sessionId(req) {
  const cookie = (req.headers.cookie ?? '').split(';').find((part) => part.trim().startsWith(`${cookieName}=`));
  const value = cookie?.trim().slice(cookieName.length + 1);
  return /^[0-9a-f]{64}$/.test(value ?? '') ? value : undefined;
}

function cookieOptions(req) {
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' };
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

export function createAuth({ db, mode = 'legacy', reportDemoCode = () => {}, clock = Date.now } = {}) {
  if (!['legacy', 'normal', 'demo'].includes(mode)) throw new Error('Unknown LabLink sign-in mode.');
  if (mode !== 'legacy' && !db) throw new Error('A database is required for this sign-in mode.');
  if (mode === 'demo' && db.location() !== null) throw new Error('Demo sign-in requires an in-memory database.');
  const router = Router();
  const codes = new Map();
  const sessions = new Map();
  const demoUsers = new Map();
  let attempts = 0;
  let windowEnds = 0;

  if (mode !== 'normal') {
    const users = db?.prepare(`
      SELECT u.id, u.display_name, u.role FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id) ORDER BY u.id
    `).all() ?? [];
    for (const user of users) {
      if (mode === 'demo') demoUsers.set(String(user.id), user);
      else {
        const code = randomBytes(16).toString('hex');
        codes.set(code, user);
        reportDemoCode(user, code);
      }
    }
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
    res.cookie(cookieName, id, { ...cookieOptions(req), maxAge: sessionTtl });
    return session;
  }

  function loadSession(req, res, next) {
    const id = sessionId(req);
    const session = sessions.get(id);
    if (session && session.expiresAt <= Date.now()) sessions.delete(id);
    req.session = sessions.get(id) ?? null;
    req.user = req.session?.user ?? null;
    res.locals.currentUser = req.user;
    res.locals.csrfToken = req.session?.csrfToken ?? null;
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

  router.get('/sign-in', (req, res) => {
    if (req.user) return res.redirect(303, '/account');
    const session = req.session ?? startSession(req, res);
    return res.render('auth/sign-in', { csrfToken: session.csrfToken, error: null });
  });

  function signIn(req, res, user) {
    // Rotate the anonymous session and CSRF token on sign-in.
    sessions.delete(sessionId(req));
    startSession(req, res, user);
    return res.redirect(303, '/account');
  }

  if (mode === 'legacy') router.post('/sign-in', (req, res) => {
    if (req.user) return res.redirect(303, '/account');
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const user = codes.get(code);
    if (!user) return res.status(401).render('auth/sign-in', { error: 'That sign-in code is not valid.' });
    return signIn(req, res, user);
  });

  if (mode === 'normal') router.post('/sign-in', async (req, res) => {
    if (req.user) return res.redirect(303, '/account');
    // One shared limit for this loopback instance, independent of cookies or IDs.
    const now = clock();
    if (now >= windowEnds) {
      attempts = 0;
      windowEnds = now + 60_000;
    }
    if (attempts >= 8) return res.set('Retry-After', String(Math.ceil((windowEnds - now) / 1000)))
      .status(429).type('text').send('Too many sign-in attempts. Try again in a minute.');
    attempts++;
    const user = await verifyCredentials(db, req.body?.collegeId, req.body?.password);
    if (!user) return res.status(401).type('text').send('The college ID or password is incorrect.');
    return signIn(req, res, user);
  });

  if (mode === 'demo') router.post('/demo/sign-in', (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.sendStatus(404);
    const user = demoUsers.get(req.body?.persona);
    if (!user) return res.status(400).type('text').send('Choose a listed demo persona.');
    return signIn(req, res, user);
  });

  router.get('/account', requireRole(), (_req, res) => res.render('auth/account'));

  router.post('/sign-out', requireRole(), (req, res) => {
    sessions.delete(sessionId(req));
    res.clearCookie(cookieName, cookieOptions(req));
    return res.redirect(303, '/');
  });

  return { router, loadSession, verifyCsrf };
}
