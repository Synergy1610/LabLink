# LabLink — Project Specification

**Status:** Approved\
**Event:** PROMPTWARS 2026\
**Deliverable:** Public GitHub repository URL\
**Build target:** Working MVP in **3 hours 15 minutes to 3 hours 30 minutes** of a four-hour event; submit before the **5:00 p.m. hard cutoff**

**Source labels:** *Confirmed* means the project owner or organizers supplied the requirement. *Existing* describes the repo at the time of review. *Proposed* marks implementation choices and assumptions from the reviewed draft, rather than organizer requirements.

## 1. Problem and goal

**Confirmed.** Students need a way to find specialized equipment, development kits, and lab workstations outside their own department. Finding a resource is only the first step: students also need to know when they can use it, whether it fits their project, and how to get faculty approval.

LabLink brings discovery, project-based access requests, and approvals into one workflow. When students compete for a slot, it recommends who should get it and helps the other student find a viable time. The goal is to make lab access easier while using available slots more effectively.

## 2. Users and MVP workflows

### Student

**Confirmed:** Discover resources across departments, get project-based recommendations, and request a booking. Every booking requires faculty approval.

**Proposed flow:**

1. Browse or search the catalog by resource name, category, or department. Each resource shows its department, capabilities, and available slots.
2. Optionally describe a project in plain language. LabLink suggests existing catalog items and explains why they fit. Students can also select equipment directly without using AI.
3. Choose a resource and preferred slot. Submit a project title or description, deadline, and any equipment requirements. The request starts as **Pending** and does not reserve the slot.
4. View the request in **My Requests**. See whether it is pending, approved, or declined. If the slot has been taken, see that clearly and choose a suggested alternative if one exists. Requesting the alternative still requires approval.

### Faculty

**Confirmed:** Faculty approve or decline all requests and make the final booking decision.

**Proposed flow:**

1. Open a queue of pending requests and see the relevant project details, resource, slot, and deadline.
2. When requests compete for a slot, see the recommended request, each contender’s alternative count, and the reason for the recommendation.
3. Approve or decline an individual request. Approval confirms the booking only if the slot is still available. A recommendation is advisory: faculty may approve another eligible request, but cannot double-book the resource.

## 3. Scheduling and fairness

**Confirmed priority order:**

1. Recommend the eligible request with the **fewest viable alternatives**.
2. If tied, recommend the request with the **earliest project deadline**.
3. If still tied, recommend the request submitted **first**.

**Proposed feasibility rules:**

- Use predefined slots and treat each catalog resource as one bookable unit. A slot is feasible if it is in the future, ends by the project deadline, and has no confirmed booking.
- Count other feasible slots for the **same resource**, excluding the contested slot. Don’t silently substitute equipment or infer constraints that the student didn’t provide. Equipment suitability is checked through catalog capabilities and faculty review; arbitrary free-text requirements are not treated as rules the scheduler can reliably enforce.
- Pending requests do not remove slots from availability. Alternatives are suggestions, not holds, and availability is checked again at approval.
- Suggest the earliest feasible alternative first. If there is none, say so plainly. Never move, approve, or decline another student’s request automatically.

**Example:** Two students want Tuesday morning on the same workstation. One has no other feasible slot before their deadline; the other can use Wednesday afternoon. LabLink recommends Tuesday for the first student and suggests Wednesday to the second. Faculty decide whether to accept the recommendation.

## 4. GenAI behavior

**Confirmed:** The demo must show both project-to-equipment matching and AI explanations of scheduling recommendations.

**Proposed integration:** Use **Gemini** through one server-side integration, subject to credential availability. Google technologies are encouraged, not required; adding another Google service without a clear benefit is out of scope.

| Feature | Expected behavior |
|---|---|
| **Equipment matching** | Send the project description and relevant catalog entries. Return suggested catalog items with short reasons. Validate item IDs against the catalog; never present invented equipment or availability as real. |
| **Scheduling explanation** | Send the scheduler’s computed outcome, alternative counts, tie-break result, and feasible slots. Gemini explains those facts in plain language. It does not calculate the winner, write bookings, or change availability. |
| **No key or provider failure** | Keep catalog search, requests, and approvals working. Show a deterministic scheduling explanation and label it as a fallback. The README distinguishes the no-key walkthrough from the live Gemini demo. |

AI calls are bounded and optional to complete the booking flow. The scheduling explanation does not need student names or free-text project descriptions.

## 5. Architecture, data, and MVP limits

**Existing:** At review, the repo was on `main` and contained only a README. There was no application stack or existing behavior to preserve.

**Proposed:** Build one web app with a lightweight database, fictional seeded data, and separate student and faculty views. Keep catalog, scheduling, approval, and AI integration code separate enough to test independently. Choose a stack that can be installed, run, and tested with a short set of documented commands.

| Record | Minimum data |
|---|---|
| **User** | ID, display name, role |
| **Resource** | ID, name, department, category, description, capabilities |
| **Slot** | ID, resource ID, start and end times |
| **Request** | Student, requested slot, project details, deadline, requirements, submission time, status |
| **Booking** | Approved request, resource slot, approving faculty member, approval time |

Use server-enforced roles. Students can view their own requests; faculty can review requests in the demo queue. Use an atomic approval operation and a database constraint to prevent two confirmed bookings for the same slot, even if approvals are attempted at the same time. Validate required fields, IDs, time ranges, and text lengths on the server. Explain errors without exposing credentials or internals.

**Out of scope for the hackathon:** Campus SSO, live inventory or calendars, automatic approvals or reassignment, notifications, recurring or multi-resource bookings, and utilization dashboards. A public deployment is optional; the MVP must run locally from a fresh clone.

## 6. Evaluation and acceptance criteria

**Confirmed:** The organizers will use an AI evaluator and grade six criteria. Its inspection method, scoring scale, and weights are unknown. The submission must be understandable from the repository and runnable in practice.

| Criterion | MVP acceptance evidence |
|---|---|
| **Code quality** | A reviewer can find the core logic, follow the booking lifecycle, and understand setup from the repo. |
| **Security** | The server rejects invalid requests and student approval attempts. Competing approvals cannot create a double-booking. No private keys or real student data are committed or exposed in frontend code. |
| **Efficiency** | Browsing, checking availability, and approving bookings do not depend on an AI response. Conflict checks consider only the relevant resource and slots. |
| **Testing** | Automated tests cover alternative counts, both tie-breaks, no feasible alternative, invalid or unauthorized actions, and double-booking prevention. A fresh-clone check verifies that the documented commands work. |
| **Accessibility** | Core flows work by keyboard, form controls have labels, focus is visible, text has readable contrast, and request statuses are conveyed in text rather than color alone. |
| **Problem alignment** | The demo shows cross-department discovery, both live GenAI features when configured, project-based requesting, a fair conflict recommendation, and faculty approval. |

**End-to-end demo:** Start with a seeded request. As a second student, describe a project, find a catalog resource in another department, and request the same slot. As faculty, inspect both requests, compare alternatives, read the explanation, and approve one. Verify the winner sees a confirmed booking and the other student sees an alternative or a clear no-alternative state. Verify a second approval cannot book the same slot. Repeat the core flow without an AI key to verify the fallback.

## 7. Submission and release checklist

**Confirmed organizer requirements:**

- The GitHub repository is **public** and has **exactly one branch, `main`**. Develop and commit directly on `main`; no feature branches or branch-based pull requests.
- Keep the repository **strictly below 10 MB**, accounting for committed history. Don’t commit dependencies, virtual environments, caches, builds, unnecessary generated files, large assets, or secrets.
- Ignore sensitive config such as `.env`. If environment variables are required, include `.env.example` with placeholders only.
- Include `README.md` with the project name and description, problem and solution, key features, stack, installation, run commands, test commands, environment variables, and external services.
- Submit the **public GitHub URL** before **5:00 p.m.** There are at most **two attempts**. Deployment is not mandatory; if a live demo is deployed, document its URL.

**Proposed release checks:** Add a reproducible demo walkthrough to the README. Verify public visibility while signed out, confirm the remote has only `main`, check repository size and tracked files, and run the setup and tests from a fresh clone. Check the portal when it opens and use the first submission attempt only after those checks pass.

## 8. Milestones and open decisions

| Elapsed time | Target |
|---|---|
| **0:00–0:45** | App setup, database, seed data, catalog, and student/faculty access |
| **0:45–1:45** | Project requests, approval flow, conflict rules, and double-booking protection |
| **1:45–2:30** | Both Gemini features and no-key fallback |
| **2:30–3:15/3:30** | Tests, accessibility pass, README, and working demo |
| **Remaining time** | Fresh-clone verification, repository checks, and submission before the cutoff |

**Still open:** The exact stack and demo sign-in mechanism, Gemini credential availability, and the portal’s submission steps. These don’t change the core MVP. If time gets tight, cut visual polish and optional deployment before cutting approval safeguards, core tests, or verification.
