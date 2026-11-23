-- All time fields are UTC Unix timestamps in milliseconds.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty'))
) STRICT;

CREATE TABLE resources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT NOT NULL
) STRICT;

CREATE TABLE slots (
  id INTEGER PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  UNIQUE (resource_id, starts_at)
) STRICT;

CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  project_details TEXT NOT NULL,
  deadline INTEGER NOT NULL,
  requirements TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  UNIQUE (id, slot_id)
) STRICT;

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL UNIQUE,
  slot_id INTEGER NOT NULL UNIQUE REFERENCES slots(id),
  faculty_id INTEGER NOT NULL REFERENCES users(id),
  approved_at INTEGER NOT NULL,
  FOREIGN KEY (request_id, slot_id) REFERENCES requests(id, slot_id)
) STRICT;

CREATE INDEX requests_by_student ON requests (student_id, submitted_at);
CREATE INDEX requests_by_slot ON requests (slot_id, status);
