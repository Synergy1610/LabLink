# LabLink

LabLink is a campus lab resource-sharing project designed to help students discover equipment across departments and request faculty-approved bookings.

The repository currently contains the Milestone 1 scaffold. It renders a placeholder page; the catalog, booking, scheduling, and AI features are not implemented yet.

## Run locally

Prerequisites: Node.js 26 and npm. No separate database service or API key is needed for the scaffold.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. Use `npm start` to run without watch mode. If needed, copy `.env.example` to `.env` and set `PORT` to an available port.

## Test

```sh
npm test
npm run check
```

The smoke tests verify that Express renders the placeholder and that built-in SQLite accepts a query. `npm run check` checks JavaScript syntax.

See the [project specification](docs/PROJECT_SPEC.md) and [implementation plan](docs/PROJECT_PLAN.md) for the approved MVP.
