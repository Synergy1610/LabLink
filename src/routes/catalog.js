import { Router } from 'express';
import { matchEquipment, projectDescriptionLimit } from '../ai/match.js';
import { requireRole } from '../auth/index.js';
import { findCatalog, formatTime } from '../booking/index.js';

export function catalogRoutes(db, clock, gemini) {
  const router = Router();

  function showCatalog(res, { search = '', project = '', matches = null, message = null, status = 200 } = {}) {
    return res.status(status).render('catalog/index', {
      search, project, matches, message, projectDescriptionLimit,
      resources: findCatalog(db, search, clock()), formatTime,
    });
  }

  router.get('/catalog', requireRole(), (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    return showCatalog(res, { search });
  });

  router.post('/catalog/match', requireRole('student'), async (req, res) => {
    const project = typeof req.body?.project === 'string' ? req.body.project.trim() : '';
    if (!project || project.length > projectDescriptionLimit) {
      return showCatalog(res, {
        status: 400, project: project.slice(0, projectDescriptionLimit),
        message: `Enter a project description of up to ${projectDescriptionLimit} characters.`,
      });
    }

    const resources = db.prepare('SELECT id, name, department, category, capabilities FROM resources ORDER BY id LIMIT 30').all();
    const result = await matchEquipment(gemini, project, resources);
    if (!result.ok) {
      const message = result.reason === 'not_configured'
        ? 'AI matching is not configured. You can still search the catalog below.'
        : 'AI matching is temporarily unavailable. You can still search the catalog below.';
      return showCatalog(res, { project, message });
    }
    return showCatalog(res, { project, matches: result.matches });
  });
  return router;
}
