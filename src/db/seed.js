const hour = 60 * 60 * 1000;
const day = 24 * hour;

// IDs are deterministic so the demo and later route tests can name the same fixtures.
export function seedDatabase(db, now, includeDemo = true) {
  if (includeDemo) {
    const addUser = db.prepare('INSERT INTO users (id, display_name, role) VALUES (?, ?, ?)');
    addUser.run(1, 'Anika Rao', 'student');
    addUser.run(2, 'Sam Chen', 'student');
    addUser.run(3, 'Dr. Mira Patel', 'faculty');
  }

  const addResource = db.prepare(`
    INSERT INTO resources (id, name, department, category, description, capabilities)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  addResource.run(1, 'Digital Oscilloscope', 'Electrical Engineering', 'Equipment',
    'A bench instrument for measuring and debugging electronic signals.',
    'Four channels, waveform capture, signal timing');
  addResource.run(2, 'Microcontroller Kit', 'Computer Engineering', 'Development Kit',
    'A starter kit for building sensor and embedded projects.',
    'Microcontroller board, breadboard, temperature and motion sensors');
  addResource.run(3, 'CAD Workstation', 'Mechanical Engineering', 'Workstation',
    'A workstation for modeling, assemblies, and design visualization.',
    '3D CAD, assembly design, rendering');

  const addSlot = db.prepare('INSERT INTO slots (id, resource_id, starts_at, ends_at) VALUES (?, ?, ?, ?)');
  for (const [slotId, resourceId, offsetDays] of [
    [1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 2, 1], [5, 2, 3], [6, 3, 2], [7, 3, 4],
  ]) {
    const startsAt = now + offsetDays * day;
    addSlot.run(slotId, resourceId, startsAt, startsAt + 2 * hour);
  }

  // Anika has no alternatives before her deadline. A student with a later
  // deadline can request the same slot and still have other viable options.
  if (includeDemo) db.prepare(`
    INSERT INTO requests (id, student_id, slot_id, project_details, deadline, requirements, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(1, 1, 1, 'Measure signal timing on a student-built motor controller.',
    now + day + 4 * hour, 'At least two channels for comparing input and output signals.', now);
}

export function expandCatalog(db, now) {
  db.exec("ALTER TABLE resources ADD COLUMN lab TEXT NOT NULL DEFAULT 'General Lab'");
  const labs = ['Electronics Lab', 'Embedded Systems Lab', 'Design & Manufacturing Lab'];
  const departments = ['Electrical Engineering', 'Computer Engineering', 'Mechanical Engineering'];
  const setLab = db.prepare('UPDATE resources SET lab = ? WHERE department = ?');
  departments.forEach((department, i) => setLab.run(labs[i], department));
  const add = db.prepare(`INSERT INTO resources (name, department, lab, category, description, capabilities)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const addSlot = db.prepare('INSERT INTO slots (resource_id, starts_at, ends_at) VALUES (?, ?, ?)');
  const dayStart = Math.floor((now + 330 * 60_000) / day) * day - 330 * 60_000;
  for (const [lab, name, category, description, capabilities] of [
    [0, 'Bench Power Supply', 'Equipment', 'Power circuit prototypes on the bench.', 'Adjustable DC output, current limiting'],
    [0, 'Function Generator', 'Equipment', 'Generate test signals for circuit experiments.', 'Sine, square, and triangle waveforms'],
    [1, 'Logic Analyzer', 'Equipment', 'Inspect several digital signals at once.', 'Digital capture, protocol decoding'],
    [1, 'Soldering Station', 'Workstation', 'Assemble and repair prototype boards.', 'Temperature-controlled iron, fume extraction'],
    [2, 'FDM 3D Printer', 'Equipment', 'Fabricate small parts from digital models.', 'PLA printing, rapid prototyping'],
    [2, 'Digital Caliper Set', 'Equipment', 'Measure prototypes and manufactured parts.', 'Inside, outside, and depth measurements'],
  ]) {
    const { lastInsertRowid: id } = add.run(name, departments[lab], labs[lab], category, description, capabilities);
    for (const offset of [day + 10 * hour, day + 14 * hour, 2 * day + 10 * hour]) {
      addSlot.run(id, dayStart + offset, dayStart + offset + 2 * hour);
    }
  }
}
