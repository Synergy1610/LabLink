import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const dummySalt = randomBytes(16).toString('hex');
const dummyHash = randomBytes(64);
const settings = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(id) ? id : null;
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

export async function provisionAccount(db, { collegeId, password, displayName, role }) {
  const id = normalizeId(collegeId);
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!id || !validPassword(password) || !name || name.length > 100 || !['student', 'faculty'].includes(role)) {
    throw new Error('Provide a valid college ID, display name, role, and a 12–128 character LabLink password.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, 64, settings)).toString('hex');

  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM credentials WHERE college_id = ?').get(id)) {
      throw new Error('That college ID already has a LabLink account.');
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO users (display_name, role) VALUES (?, ?)').run(name, role);
    db.prepare('INSERT INTO credentials (user_id, college_id, salt, password_hash) VALUES (?, ?, ?, ?)')
      .run(lastInsertRowid, id, salt, hash);
    db.exec('COMMIT');
    return lastInsertRowid;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function verifyCredentials(db, collegeId, password) {
  const id = normalizeId(collegeId);
  if (!id || !validPassword(password)) return null;
  const account = db.prepare(`
    SELECT u.id, u.display_name, u.role, c.salt, c.password_hash
    FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.college_id = ?
  `).get(id);
  const derived = await derive(password, account?.salt ?? dummySalt, 64, settings);
  const matches = timingSafeEqual(derived, account ? Buffer.from(account.password_hash, 'hex') : dummyHash);
  return account && matches ? { id: account.id, display_name: account.display_name, role: account.role } : null;
}
