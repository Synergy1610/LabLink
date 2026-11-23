import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { openScaffoldDatabase } from '../src/db/index.js';

// T-001: Verify that Express renders the placeholder through EJS.
test('GET / renders the LabLink placeholder', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /<h1>LabLink<\/h1>/);
});

// T-002: Verify connectivity without creating a local database file.
test('built-in SQLite accepts a query', () => {
  const db = openScaffoldDatabase();
  try {
    assert.equal(db.prepare('SELECT 1 AS ready').get().ready, 1);
  } finally {
    db.close();
  }
});
