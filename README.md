# LabLink

LabLink helps students find equipment across campus departments and request faculty-approved bookings. When students compete for a slot, it recommends the request with the fewest available alternatives before its deadline. Ties go to the earliest deadline, then the earliest submission. Faculty decide what to approve.

## Quick start

Use Node.js 26 and npm. Express and EJS serve the app; Node's built-in SQLite stores requests and bookings. No separate database service or API key is required for the core flow.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:3000>. The current browser flow uses temporary codes printed in the terminal. Sign out to switch accounts. College ID sign-in and one-click demo entry are being prepared; their screens are not enabled in this build.

### Try a scheduling conflict

1. On a fresh local database, sign in as **Sam Chen**. In the catalog, look up **Digital Oscilloscope** and choose its first slot. Anika already has a pending request for that slot.
2. Enter a project description and set Sam's deadline after the **last** oscilloscope slot ends. Dates are **DD/MM/YYYY** and times are **IST**.
3. Sign in as **Dr. Mira Patel** and open **Review booking requests**. The queue should recommend Anika because she has **0** alternatives and Sam has **2**. If Gemini is configured, click **Explain with Gemini** before approving; otherwise the rule-based explanation is already visible.
4. Approve Anika. As Sam, open **My requests** and check that LabLink offers the earliest viable alternative. Requesting it creates a new pending request.

## Optional Gemini features

With a Gemini API key, students can get equipment matches from their project descriptions and faculty can request a plain-language explanation of a recommendation. Gemini cannot alter bookings. Without a key, catalog search, booking, and rule-based recommendations still work.

Copy `.env.example` to `.env`, set `GEMINI_API_KEY` locally, and restart. `GEMINI_MODEL` can optionally override the default model. `PORT` overrides the default `3000`. Never commit `.env` or send private data in a demo prompt.

## Checks

```sh
npm test
npm run check
```

Tests use isolated databases and stub Gemini. See the [specification](docs/PROJECT_SPEC.md) and [implementation plan](docs/PROJECT_PLAN.md) for the remaining work.
