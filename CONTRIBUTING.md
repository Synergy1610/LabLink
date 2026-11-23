# Contributing

Thanks for taking an interest in LabLink. The project is a small educational prototype, and clear, focused changes are easiest to review.

## Set up locally

1. Install Node.js 26 and npm.
2. Clone the repository and run `npm ci`.
3. Run `npm run demo` and open <http://127.0.0.1:3000/sign-in> for the passwordless walkthrough.
4. Before opening a change, run `npm run check` (ESLint plus the complete test suite).

Optional Gemini behavior is configured with a local `.env` file; see `.env.example`. Core flows and tests do not require an API key.

## Change guidelines

- Keep scheduling decisions deterministic and independent of AI output.
- Preserve server-side role checks, CSRF protection, transactional approvals, and the unique-booking constraint.
- Add or update tests when behavior changes, especially for booking rules and role boundaries.
- Do not commit `.env`, local SQLite files, real personal data, or school logos without permission.
- Keep changes focused; explain behavior changes and verification in the pull request.

GitHub Actions runs `npm run check` on pushes to `main` and pull requests.
