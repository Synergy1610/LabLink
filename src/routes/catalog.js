import { Router } from 'express';
import { matchEquipment, projectDescriptionLimit } from '../ai/match.js';
import { geminiFailureMessage } from '../ai/messages.js';
import { requireRole } from '../auth/index.js';
import { findCatalog } from '../booking/index.js';

const photos = {
  1: { src: '/equipment/oscilloscope.webp', alt: 'Digital oscilloscope displaying several waveforms' },
  2: { src: '/equipment/kit.webp', alt: 'Arduino microcontroller board with USB connector and pin headers' },
  3: { src: '/equipment/workstation.webp', alt: 'Desktop workstation computers' },
  4: { src: '/equipment/supply.webp', alt: 'Bench power supply with output terminals and adjustment knobs' },
  5: { src: '/equipment/generator.webp', alt: 'Function generator with waveform controls' },
  6: { src: '/equipment/analyzer.webp', alt: 'Logic analyzer with a display and control panel' },
  7: { src: '/equipment/solder.webp', alt: 'Soldering station with an iron in its stand' },
  8: { src: '/equipment/printer.webp', alt: 'Open-frame Prusa i3 3D printer' },
  9: { src: '/equipment/caliper.webp', alt: 'Digital caliper with a sliding jaw and LCD display' },
};

const photoFor = (id) => photos[id];
const readSearch = (value) => typeof value === 'string' ? value.trim().slice(0, 100) : '';

export function catalogRoutes(db, clock, gemini) {
  const router = Router();

  function showCatalog(res, { search = '', lab = '', project = '', matches = null, message = null, status = 200 } = {}) {
    const labs = db.prepare('SELECT DISTINCT lab FROM resources ORDER BY lab').all().map((row) => row.lab);
    if (!labs.includes(lab)) lab = '';
    const resources = findCatalog(db, search, clock(), lab);
    const labGroups = labs.map((name) => ({ name, resources: resources.filter((resource) => resource.lab === name) }))
      .filter((group) => group.resources.length);
    return res.status(status).render('catalog/index', {
      search, lab, labs, project, matches, message, projectDescriptionLimit,
      resources, labGroups, photoFor,
    });
  }

  router.get('/catalog', requireRole(), (req, res) => {
    return showCatalog(res, { search: readSearch(req.query.q), lab: req.query.lab });
  });

  router.post('/catalog/match', requireRole('student'), async (req, res) => {
    const filters = { search: readSearch(req.body?.q), lab: req.body?.lab };
    const project = typeof req.body?.project === 'string' ? req.body.project.trim() : '';
    if (!project || project.length > projectDescriptionLimit) {
      return showCatalog(res, {
        ...filters, status: 400, project: project.slice(0, projectDescriptionLimit),
        message: `Enter a project description of up to ${projectDescriptionLimit} characters.`,
      });
    }

    const resources = db.prepare('SELECT id, name, department, lab, category, capabilities FROM resources ORDER BY id LIMIT 30').all();
    const result = await matchEquipment(gemini, project, resources);
    if (!result.ok) {
      const message = `${geminiFailureMessage(result.reason)} You can still search the catalog below.`;
      return showCatalog(res, { ...filters, project, message });
    }
    return showCatalog(res, { ...filters, project, matches: result.matches });
  });
  return router;
}
