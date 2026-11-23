import { createInterface } from 'node:readline/promises';
import { openNormalDatabase } from '../db/index.js';
import { provisionAccount } from './credentials.js';

async function main() {
  const [, , collegeId, role, displayName] = process.argv;
  if (!collegeId || !displayName || !['student', 'faculty'].includes(role) || process.argv.length !== 5 || process.stdin.isTTY) {
    throw new Error('Usage: npm run provision -- COLLEGE_ID student|faculty "Display Name" (password on stdin, not in command arguments)');
  }
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let password;
  try {
    for await (const line of input) {
      password = line;
      break;
    }
  } finally {
    input.close();
  }
  const db = openNormalDatabase();
  try {
    await provisionAccount(db, { collegeId, role, displayName, password });
    console.log(`LabLink ${role} account created.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
