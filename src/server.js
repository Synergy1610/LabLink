import { createApp } from './app.js';
import { openDatabase, openNormalDatabase } from './db/index.js';
import { openReviewDatabase } from './db/review.js';
import { createHostedDemo } from './hosted-demo.js';

const hosted = process.argv.includes('--hosted-demo');
const host = hosted ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const demo = process.argv.includes('--demo');
const review = process.argv.includes('--review');
if (Number(hosted) + Number(demo) + Number(review) > 1) throw new Error('Choose only one LabLink mode.');
const db = hosted ? null : demo ? openDatabase(':memory:') : review ? await openReviewDatabase() : openNormalDatabase();
const app = hosted ? createHostedDemo() : createApp({ db, authMode: demo ? 'demo' : 'normal' });
app.listen(port, host, () => {
  console.log(`LabLink ${hosted ? 'hosted demo' : demo ? 'demo' : review ? 'password-protected review' : 'campus'} mode: http://${host}:${port}/sign-in`);
});
