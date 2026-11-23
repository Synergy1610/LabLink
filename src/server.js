import { createApp } from './app.js';
import { openDatabase } from './db/index.js';

// T-001: Start only the local web server.
const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const db = openDatabase();
const demoCodes = [];
const app = createApp({ db, reportDemoCode: (user, code) => demoCodes.push({ user, code }) });
app.listen(port, host, () => {
  console.log(`LabLink listening at http://${host}:${port}`);
  console.log(`Local demo sign-in: http://${host}:${port}/sign-in`);
  for (const { user, code } of demoCodes) {
    console.log(`  ${user.display_name} (${user.role}): ${code}`);
  }
});
