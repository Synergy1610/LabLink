import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { seedDatabase, expandCatalog } from './seed.js';

const defaultPath = fileURLToPath(new URL('../../data/lablink.sqlite', import.meta.url));
const normalPath = fileURLToPath(new URL('../../data/normal.sqlite', import.meta.url));
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const credentialsSchema = readFileSync(new URL('./credentials.sql', import.meta.url), 'utf8');
const schemaVersion = 3;

// Call once at startup. Tests can supply ':memory:' and a fixed clock.
export function openDatabase(path = defaultPath, { now = Date.now(), includeDemo = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });

  try {
    db.exec('PRAGMA busy_timeout = 5000');
    // Take the write lock before checking the version so two first opens cannot both seed.
    db.exec('BEGIN IMMEDIATE');
    try {
      const { user_version: version } = db.prepare('PRAGMA user_version').get();
      if (version === 0) {
        db.exec(schema);
        seedDatabase(db, now, includeDemo);
      } else if (version < 1 || version > schemaVersion) {
        throw new Error(`Unsupported LabLink database version: ${version}`);
      }
      if (version < 2) db.exec(credentialsSchema);
      if (version < 3) {
        expandCatalog(db, now);
        db.exec(`PRAGMA user_version = ${schemaVersion}`);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function openNormalDatabase() {
  return openDatabase(normalPath, { includeDemo: false });
}

// Keep the existing scaffold smoke test on the same initialization path.
export function openScaffoldDatabase() {
  return openDatabase(':memory:');
}
