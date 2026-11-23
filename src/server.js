import { createApp } from './app.js';
import { openDatabase, openNormalDatabase } from './db/index.js';
import { openReviewDatabase } from './db/review.js';

// T-001: Start only the local web server.
const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const demo = process.argv.includes('--demo');
const review = process.argv.includes('--review');
if (demo && review) throw new Error('Use either --demo or --review, not both.');
const db = demo ? openDatabase(':memory:') : review ? await openReviewDatabase() : openNormalDatabase();
const app = createApp({ db, authMode: demo ? 'demo' : 'normal' });
app.listen(port, host, () => {
  console.log(`LabLink ${demo ? 'demo' : review ? 'password-protected review' : 'campus'} mode: http://${host}:${port}/sign-in`);
});
