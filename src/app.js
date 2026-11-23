import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import { createGeminiClient } from './ai/client.js';
import { createAuth } from './auth/index.js';
import { securityHeaders } from './http/security.js';
import { catalogRoutes } from './routes/catalog.js';
import { facultyRoutes } from './routes/faculty.js';
import { requestRoutes } from './routes/requests.js';

export function createApp({ db, authMode, clock = Date.now, gemini = createGeminiClient(), hostedDemo = false, requestLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.hostedDemo = hostedDemo;
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../views/', import.meta.url)));
  if (!hostedDemo) {
    app.use(securityHeaders);
    app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  }
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 30 }));

  const auth = createAuth({ db, mode: authMode, hostedDemo });
  app.use(auth.loadSession, auth.verifyCsrf, auth.router);

  const schoolLogos = (hostedDemo ? [] : [
    { name: 'DPS Electronic City', key: 'dps-ecity' },
    { name: 'Greenwood High International School', key: 'greenwood-high' },
  ]).map(({ name, key }) => ({
    name, src: `/branding/${key}.webp`, file: fileURLToPath(new URL(`../data/${key}-logo.webp`, import.meta.url)),
  }));
  for (const logo of schoolLogos) {
    app.get(logo.src, (_req, res, next) => {
      if (!existsSync(logo.file)) return next();
      return res.sendFile(logo.file);
    });
  }
  app.get('/', (_req, res) => res.render('index', { schoolLogo: schoolLogos.find(({ file }) => existsSync(file)) }));
  if (db) app.use(catalogRoutes(db, clock, gemini), requestRoutes(db, clock, { requestLimit }), facultyRoutes(db, clock, gemini));
  app.use((_req, res) => res.status(404).type('text').send('Page not found.'));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.status === 413) {
      return res.status(413).type('text').send('Request is too large.');
    }
    if (error.status === 400) {
      return res.status(400).type('text').send('Invalid request.');
    }
    return res.status(500).type('text').send('Something went wrong.');
  });

  return app;
}
