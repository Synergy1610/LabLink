# LabLink

LabLink helps students find equipment across campus departments and request faculty-approved bookings. When students compete for a slot, it recommends the request with the fewest available alternatives before its deadline. Ties go to the earliest deadline, then the earliest submission. Faculty decide what to approve.

## Quick start: one-click demo

Use Node.js 26 and npm. Express and EJS serve the app; Node's built-in SQLite stores requests and bookings. No separate database service or API key is required for the core flow.

```sh
npm ci
npm run demo
```

Open <http://127.0.0.1:3000/sign-in>. There are no credentials to enter. **Switch role** changes accounts in the same sandbox; restarting the demo resets all its data.

### Try a scheduling conflict

1. Click **Try as Student · Sam Chen** and then **Open demo booking**. Anika already has a pending request for the first **Digital Oscilloscope** slot.
2. Submit the prefilled request. Sam's deadline is after the last oscilloscope slot; all dates use **DD/MM/YYYY** and times are **IST**.
3. Use **Switch role → Try as Faculty · Dr. Mira Patel**, then open **Faculty queue**. LabLink recommends Anika because she has **0** alternatives and Sam has **2**. If Gemini is configured, try **Explain with Gemini** before approving.
4. Approve Anika. Switch back to Sam and open **My requests**. It shows **Slot taken** and offers the earliest viable alternative. Submitting it creates a new pending request.

## Normal mode: college ID and password

Normal mode uses a separate persistent SQLite database at `data/normal.sqlite`. It has sample equipment and slots, but no preset accounts or requests. An administrator provisions each college ID and assigns its role. Use a **LabLink-specific** password of 12–128 characters, not an existing campus password.

In Bash, provision a student without putting the password in shell history or command arguments:

```bash
read -rsp 'New LabLink password: ' lablink_password; printf '\n'
printf '%s\n' "$lablink_password" | npm run provision -- STUDENT-001 student 'Student Name'
unset lablink_password
npm start
```

Use `faculty` in place of `student` and a different college ID to provision a faculty account. Open <http://127.0.0.1:3000/sign-in>. There is no public signup or password recovery flow. Both modes bind to localhost; use a narrow viewport in browser developer tools to try the mobile layout locally.

## Optional Gemini features

With a Gemini API key, students can get equipment matches from their project descriptions and faculty can request a plain-language explanation of a recommendation. Gemini cannot alter bookings. Without a key, catalog search, booking, and rule-based recommendations still work.

Copy `.env.example` to `.env`, set `GEMINI_API_KEY` locally, and restart. `GEMINI_MODEL` can optionally override the default model. `PORT` overrides the default `3000`. Never commit `.env` or send private data in a demo prompt.

## Checks

```sh
npm test
npm run check
```

Tests use isolated databases and stub Gemini. See the [specification](docs/PROJECT_SPEC.md), [implementation plan](docs/PROJECT_PLAN.md), and [photo credits](docs/PHOTO_CREDITS.md).
