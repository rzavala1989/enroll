# Next.js web app design

Date: 2026-06-11
Status: approved

Replace the Angular frontend with a Next.js (latest, App Router) app covering the full API surface: auth, catalog, course detail, enroll with waitlist outcomes, my enrollments with drop and leave-waitlist, and the ADMIN/ADVISOR section waitlist view.

## Repo layout

- `apps/web` (Angular 18) moves to `apps/web-angular`. It stays buildable but is removed from the root `dev:web` and build scripts.
- New Next.js app at `apps/web`: `create-next-app@latest` defaults (App Router, TypeScript strict, Tailwind v4, ESLint, `src/` dir), pnpm workspace member.
- `apps/web` depends on `@enroll/shared` for all API types. New response types for the two API additions land in `packages/shared` first, then `pnpm build:shared`.
- Dev: `pnpm dev:web` runs `next dev --port 3001`. The API keeps `:3000`.

## API additions (NestJS, the only backend changes)

1. `GET /api/enrollments`: the current student's enrollments, active and past. Role `STUDENT`, student id from JWT `sub`. No pagination. Row shape:
   `{ id, status, enrolledAt, waitlistPosition?, section: { id, sectionNumber, instructorName, meetingPattern, room }, course: { id, code, title, credits } }`
2. `GET /api/auth/me`: `{ id, email, firstName, lastName, roles }` for the logged-in user. `JwtAuthGuard` only, no role restriction.

No Prisma schema changes, no migrations.

## Integration architecture

Approach: rewrite proxy with hybrid rendering (chosen over pure client-side fetching and over a full BFF).

- `next.config` rewrites `/api/:path*` to `http://localhost:3000/api/:path*` (target from env `API_URL`). The browser only talks to its own origin, so the API's HTTP-only cookies flow with no CORS or SameSite changes.
- Server Components fetch `${API_URL}/api/...` directly, forwarding the request cookies via `next/headers`. `cache: 'no-store'` everywhere; the API already caches the courses list for 5 minutes server-side, so Next adds no caching layer of its own.
- Client components fetch `/api/...` same-origin through the rewrite.

## Auth and session

- `/login`: client form posting to `/api/auth/login` through the proxy. `Set-Cookie` passes through. Logout posts to `/api/auth/logout` and redirects to `/login`.
- `middleware.ts` on all routes except `/login` and static assets:
  - `access_token` cookie present: continue.
  - No `access_token`, `refresh_token` present: call `POST ${API_URL}/api/auth/refresh` server-side, copy the returned `Set-Cookie` headers onto the response, continue.
  - Neither cookie: redirect to `/login?next=<path>`.
- Client `apiFetch` wrapper: on 401, call `/api/auth/refresh` once, replay the request. A second 401 redirects to `/login`.
- RSC fetches that 401 after middleware ran call `redirect('/login')`.
- Identity for the UI: the root layout decodes the `access_token` payload (decode only, no signature verification; the API enforces authz) for `{ sub, roles }` and calls `/auth/me` for name and email. Both go into a small client context for the nav.

## Routes

| Route | Render | Access |
|---|---|---|
| `/` | redirect to `/catalog` | any authed |
| `/login` | client | public |
| `/catalog` | RSC, `searchParams`-driven: `search`, `department`, `page`, `limit`, `sortBy` | any authed |
| `/courses/[id]` | RSC detail and sections table; client `EnrollButton` per section | any authed; enroll button rendered for STUDENT only |
| `/enrollments` | RSC list from `GET /enrollments`; client drop and leave-waitlist buttons | STUDENT |
| `/sections/[id]/waitlist` | RSC table: position, name, joinedAt | ADMIN or ADVISOR; linked from course detail sections when the role permits |

Role gating in the UI is convenience only; the API guards remain the source of truth.

## Data flow details

- Catalog search box: client component, 300ms debounce into `router.replace` URL updates with `useTransition`. URL stays shareable and reload-safe, matching the Angular catalog UX.
- Mutations (enroll, drop, leave waitlist): client `apiFetch` then `router.refresh()` so RSC data on the page revalidates.
- Enroll outcomes: 201 ENROLLED shows a success toast with seat count; 201 WAITLISTED shows a toast with the waitlist position; failure codes (`ALREADY_ENROLLED`, `ALREADY_WAITLISTED`, `REGISTRATION_CLOSED`, `SECTION_NOT_FOUND`, ...) map to human messages rendered inline on the button row.

## Error handling

- Per-route `error.tsx` with a retry button, `not-found.tsx` for bad ids (RSC maps API 404 to `notFound()`), `loading.tsx` skeletons for catalog and course detail.
- One in-repo toast system (context plus portal, auto-dismiss). No dependency.
- A single failure-code-to-message map in `lib/` covers every `EnrollFailureCode`; unknown codes fall back to the API message string.
- Client mutation failures render inline next to the triggering control.

## Design system

Custom Tailwind v4 theme, hand-rolled components, no component library. Built during implementation under the frontend-design skill. University-registrar identity: serious typography, dense data tables for sections and the waitlist, explicit seat-availability states (open, nearly full, full, waitlisted). Tokens in `globals.css` `@theme`; shared components in `components/ui/` (button, badge, table, card, toast, skeleton). Status colors keyed to `EnrollmentStatus` so statuses render the same on every page.

## Testing

- `apps/web`: Vitest, React Testing Library, happy-dom.
  - `apiFetch` 401-refresh-retry logic (mocked fetch).
  - Failure-code message map.
  - `EnrollButton` state transitions: idle, pending, enrolled, waitlisted, error.
  - Catalog search params serialization helper.
- `apps/api`: jest specs for `listMine` and `/auth/me` next to the existing suites.
- No e2e harness this round, consistent with the repo today.
- Manual verification at the end: browser walkthrough against the live dev API, including waitlist promotion with a capacity-2 section (`UPDATE "Section" SET capacity = 2, "enrolledCount" = 0 WHERE id = '<id>'`).

## Out of scope

- Notifications on waitlist promotion, waitlist size caps, admin reordering, section capacity editing (all previously deferred from the waitlist phase).
- Course detail term switching (the API serves the active term only).
- Deleting the Angular app outright; it is archived at `apps/web-angular`.