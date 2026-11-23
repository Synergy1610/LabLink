import { fileURLToPath } from 'node:url';
import express from 'express';
import { createGeminiClient } from './ai/client.js';
import { createDemoAuth } from './auth/index.js';
import { catalogRoutes } from './routes/catalog.js';
import { facultyRoutes } from './routes/faculty.js';
import { requestRoutes } from './routes/requests.js';

export function createApp({ db, reportDemoCode, clock = Date.now, gemini = createGeminiClient() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../views/', import.meta.url)));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 30 }));

  const demoUsers = db?.prepare('SELECT id, display_name, role FROM users ORDER BY id').all() ?? [];
  const auth = createDemoAuth(demoUsers, reportDemoCode);
  app.use(auth.loadSession, auth.verifyCsrf, auth.router);

  app.get('/', (_req, res) => res.render('index'));
  if (db) app.use(catalogRoutes(db, clock, gemini), requestRoutes(db, clock), facultyRoutes(db, clock, gemini));
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
