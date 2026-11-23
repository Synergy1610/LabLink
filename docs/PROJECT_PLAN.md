# LabLink — Project Plan

**Status:** Approved\
**Product source of truth:** [PROJECT_SPEC.md](PROJECT_SPEC.md)\
**Event:** PROMPTWARS 2026

## Tech Stack & Architecture

- One server-rendered Node.js 26 app: Express 5, EJS 3, and plain CSS. No frontend build or external database service. Verified locally: Node 26.13.1, npm 11.20.0, built-in `node:sqlite` using SQLite 3.54.1. The repo had no application stack to migrate.
- Use HTML pages and form posts, with booking, scheduling, and AI logic independent of templates. SQLite stores users, resources, slots, requests, and bookings. Seed fictional accounts and future slots relative to setup time.
- Bind to loopback by default. Replace the original temporary-code sign-in with administrator-provisioned college IDs and LabLink-specific passwords for `npm start`; store salted password hashes, throttle attempts, and keep server-side sessions, role checks, and CSRF protection. `npm run demo` will use its own fresh in-memory database and one-click fictional personas; normal mode must not expose the demo entry route. Students only see their own requests. No signup or password recovery flow.
- Keep approval transactional: recheck slot feasibility and request status, insert a booking, and update the request together. A unique constraint on the booked slot prevents double-booking. Seed non-overlapping slots for each resource.
- Put Gemini behind one server-side adapter. Scheduling is deterministic and advisory; order eligible requests by fewest feasible same-resource alternatives, earliest deadline, then earliest submission. AI calls are optional and separate from ordinary browsing and booking. No-key operation is required; live verification needs credentials.
- Build and verify locally. Public deployment is optional and not budgeted. If deployed later, revisit demo authentication and use a persistent disk for SQLite.

## Time Budget

The spec records a four-hour event, a working build target of **3h 15m–3h 30m**, and a **5:00 p.m. hard cutoff**. At the agreed planning snapshot of **1:02 p.m. IST**, **238 minutes** remained on the assumption of no scheduled breaks. The task estimates total **220 minutes**: **195** for the build and hardening, plus **25** reserved for release verification. The snapshot left **18 minutes of slack**; subtract any further elapsed time or interruptions before beginning. Cut visual polish and optional hosting before cutting safeguards or verification.

## Milestones

| ID | Milestone | Minutes | Done when |
|---|---|---:|---|
| M1 | Booking loop | 55 | **Must demo:** A student browses seeded resources, requests a slot, and sees a faculty decision. Approval is atomic. |
| M2 | Fair conflict handling | 45 | **Must demo:** Faculty compare competing requests; the student who misses out sees and can request an alternative, or sees that none exists. |
| M3 | Gemini and fallback | 45 | **Must demo:** Configured Gemini matches equipment and explains scheduling; ordinary booking still works without a key. |
| M4 | Hardening and docs | 50 | **Must ship:** Core tests pass, the flow works by keyboard, and README instructions reproduce it. |
| M5 | Release verification | 25 | **Must ship:** A fresh clone runs, repo requirements are verified, and the public URL is ready to submit. |

## Task Breakdown

| ID | Title | Milestone | Owner | Owned files | Dependencies | Estimate (min) | Size |
|---|---|---|---|---|---:|---|
| T-001 | Initialize the app | M1 | Unassigned | `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `src/app.js`, `src/server.js` | None | 12 | S |
| T-002 | Create and seed SQLite | M1 | Unassigned | `src/db/` | T-001 | 15 | M |
| T-003 | Add demo authentication | M1 | Unassigned | `src/auth/`, `views/auth/`, `src/app.js` | T-001, T-002 | 13 | M |
| T-004 | Connect catalog, requests, and approvals | M1 | Unassigned | `src/routes/{catalog,requests,faculty}.js`, `src/booking/`, `views/{catalog,requests,faculty}/`, `src/app.js` | T-002, T-003 | 15 | M |
| T-005 | Implement the scheduler | M2 | Unassigned | `src/scheduling/` | T-002, T-004 | 18 | M |
| T-006 | Show the faculty recommendation | M2 | Unassigned | `src/routes/faculty.js`, `views/faculty/` | T-005 | 17 | M |
| T-007 | Show student alternatives | M2 | Unassigned | `src/routes/requests.js`, `views/requests/` | T-005, T-006 | 10 | S |
| T-008 | Add the Gemini adapter | M3 | Unassigned | `src/ai/client.js` | T-001 | 15 | M |
| T-009 | Add AI equipment matching | M3 | Unassigned | `src/ai/match.js`, `src/routes/catalog.js`, `views/catalog/` | T-004, T-008 | 15 | M |
| T-010 | Add AI scheduling explanations | M3 | Unassigned | `src/ai/explain.js`, `src/routes/faculty.js`, `views/faculty/` | T-006, T-008 | 15 | M |
| T-011 | Automate core tests | M4 | Unassigned | `test/` | T-004, T-005, T-007, T-009, T-010 | 23 | M |
| T-012 | Check keyboard use and errors | M4 | Unassigned | `public/styles.css`, `views/` | T-007, T-009, T-010 | 14 | M |
| T-013 | Document setup and demo | M4 | Unassigned | `README.md` | T-004, T-007, T-009, T-010 | 13 | S |
| T-014 | Verify the release | M5 | Unassigned | None; verification only | T-011, T-012, T-013 | 25 | M |

### Contracts, integration, and acceptance

| Task | Scope and interface | Integration and acceptance check |
|---|---|---|
| T-001 | Testable Express app factory, EJS, static assets, bounded form parsing, error handling, and npm scripts. No build pipeline. | `npm start` serves locally. Ignore secrets, dependencies, databases, caches, and generated output; track only placeholder configuration. |
| T-002 | Initialize users, resources, slots, requests, and bookings with foreign keys and a unique booked slot. No external database. | Seed multiple departments, future slots, demo accounts, and a pending conflict fixture. Repeat initialization without duplicating data. |
| T-003 | Sign-in and sign-out, session identity, role guards, and CSRF checks. No campus login. | Run guards before protected routes; students cannot access faculty actions, including by posting a different role. |
| T-004 | `GET /catalog`, `GET/POST /requests`, `GET /faculty`, and POST faculty approve/decline actions. No scheduler or AI in this slice. | Search/select a resource, create a validated pending request, and see the decision. Pending does not reserve a slot. Student reads are scoped to the session. Approval atomically rechecks feasibility and writes booking/status; unavailable approvals fail without a second booking. |
| T-005 | Return eligible contenders, viable same-resource alternatives and counts, recommended request, tie-break reason, and earliest viable slots. Do not mutate requests. | Exclude the contested slot, past slots, slots beyond the deadline, and confirmed bookings. Exercise both tie-breaks and the zero-alternative case. |
| T-006 | Render scheduler facts with the pending faculty queue. No automatic decisions. | Two competing requests show the recommendation and why. Faculty can approve another eligible request, subject to normal checks. |
| T-007 | Display a taken-slot state and earliest viable alternative, or say none exists. No moves or holds. | Requesting an alternative creates a new pending request through the existing validated flow. The original is not silently changed. |
| T-008 | Server-only Gemini adapter using `fetch`, a timeout, configurable model, and explicit errors. No booking or UI logic. | Test with stubbed requests. Missing configuration or provider failures do not prevent startup. |
| T-009 | Optional catalog action sends the project description and relevant catalog entries; render validated catalog IDs and short reasons only. | Reject unknown IDs. Catalog search and ordinary requests stay usable on missing credentials or provider failure. |
| T-010 | Optional faculty action sends computed facts without student names or free-text project descriptions. No AI ranking or mutations. | Display canonical scheduling facts regardless of provider output. On failure or no key, label the deterministic explanation as fallback. |
| T-011 | Use `node --test`, isolated databases, and a stubbed AI adapter. No live network dependency. | Cover alternative counts, both tie-breaks, no alternative, invalid input, role enforcement, competing approvals, and provider failure. `npm test` passes without a key. |
| T-012 | Wire both sign-in screens, then refine templates and styles for labels, keyboard use, visible focus, readable contrast, text statuses, and errors. | Walk both modes at 320 CSS pixels without horizontal scrolling or zooming, including invalid input, faculty comparison, and a taken slot. |
| T-013 | README covers the problem, solution, features, stack, prerequisites, installation, demo sign-in, run/test commands, configuration, and external service. | Include a reproducible conflict walkthrough and distinguish live AI from no-key fallback. |
| T-014 | Final fresh-clone and public-repo checks. Live Gemini smoke test depends on credentials; submission depends on portal availability. No optional deployment work. | Install, test, run, and rehearse from `main`. Check public visibility while signed out, only `main` on the remote, size strictly below 10 MB including history, and no secrets or generated files. Hand off the verified URL before cutoff; preserve both attempts until checks pass. |

## Integration & Shared Files

- **App entry:** T-001 establishes `src/app.js`, T-003 adds auth and guards, then T-004 mounts booking routes. Verify startup, sign-in, and the booking loop at their respective handoffs.
- **Faculty route and templates:** T-004 establishes the queue and actions, T-006 adds scheduler facts, then T-010 adds AI explanations. Re-run the faculty conflict and approval paths after each handoff.
- **Catalog and request routes:** T-004 establishes both. T-007 extends only student requests; T-009 extends only catalog. Verify that ordinary forms still work without AI.
- **Templates:** T-012 takes final ownership of accessibility changes after T-007, T-009, and T-010. T-011 and T-013 use distinct files and may proceed once their dependencies land. T-008 can also run independently of booking work after T-001.

## Dependencies & Setup

- Node.js 26 and npm; no separate SQLite service or frontend build step. Commit the npm lockfile.
- Final commands: `npm ci`, `npm run demo`, `npm start`, and `npm test`. Put the demo walkthrough first in the README and document provisioning and normal sign-in separately. Tests use isolated data. Until the sign-in screens are wired, the original startup codes remain available for local development.
- Optional: copy `.env.example` to ignored `.env` and set `GEMINI_API_KEY` and, if needed, `GEMINI_MODEL`. The server loads configuration locally; no private key goes to browser code.

## Risks & Assumptions

- **Clock:** The cutoff is assumed to be in IST. The schedule is a planning snapshot, not a guarantee of remaining time.
- **AI credentials:** Both integrations can be written and tested with stubs. If credentials are unavailable, report the live Gemini smoke test as unverified; do not present fallback content as AI.
- **Portal:** Check it when it opens and do not spend either attempt prematurely. The public GitHub repo is the deliverable; deployment is optional.
- **Scope:** Fictional demo data, predefined slots, same-resource alternatives, faculty approval for every booking, and no silent reassignment. The approved specification governs product decisions.
