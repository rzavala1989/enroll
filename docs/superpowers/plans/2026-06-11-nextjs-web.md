# Next.js Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Angular frontend with a Next.js 16 App Router app at `apps/web` covering login, catalog, course detail, enroll with waitlist outcomes, my enrollments, and the admin/advisor waitlist view, plus two small NestJS endpoints the UI needs.

**Architecture:** Rewrite proxy (`/api/*` to `localhost:3000`) so the API's HTTP-only cookies work with no CORS changes. Server Components fetch the API directly with forwarded cookies; client islands (search, enroll, drop) fetch through the proxy with a 401-refresh-retry wrapper. `src/proxy.ts` (the Next 16 rename of middleware) silently refreshes expired sessions and gates protected routes.

**Tech Stack:** Next.js 16 (App Router, Turbopack, React 19), TypeScript strict, Tailwind v4 with a hand-rolled design system, Vitest with React Testing Library and happy-dom for web tests, existing NestJS/Prisma/jest stack for the API.

**Spec:** `docs/superpowers/specs/2026-06-11-nextjs-web-design.md`

**Repo conventions that bind every task:**
- Commit directly to `main` (standing consent in this repo). Prefixes follow existing history: `web:`, `api:`, `shared:`, `docs:`.
- No em-dashes and no plus sign as shorthand for "and" in any prose, comment, or commit message.
- After editing `packages/shared/src/`, run `pnpm build:shared` before anything imports it.
- The user's API dev server runs on `:3000` with `--watch`; it hot-reloads API changes. A smoke boot that prints "Nest application successfully started" then `EADDRINUSE` counts as success.
- Next.js 16 notes: `cookies()` and the `params`/`searchParams` page props are async (await them). `proxy.ts` replaces `middleware.ts`; the exported function is named `proxy`, runtime is nodejs.

**One deviation from the spec:** the spec mentioned decoding the JWT in the layout for roles. `GET /auth/me` already returns roles, so there is no JWT decode helper. One identity source instead of two.

## File structure

```
apps/web-angular/                  (Task 1: archived Angular app, renamed package)
packages/shared/src/
  enrollment.ts                    (Task 2: adds MyEnrollment types, EnrollmentResult.waitlistPosition)
  auth.ts                          (Task 2: new, AuthUser)
  waitlist.ts                      (Task 2: new, WaitlistEntry)
  index.ts                         (Task 2: adds exports)
apps/api/src/
  auth/dto/me.dto.ts               (Task 3: new, MeResponseDto)
  auth/auth.service.ts             (Task 3: adds me())
  auth/auth.service.spec.ts        (Task 3: new)
  auth/auth.controller.ts          (Task 3: adds GET /auth/me)
  enrollment/dto/my-enrollment.dto.ts   (Task 4: new)
  enrollment/enrollment.service.ts      (Task 4: adds listMine())
  enrollment/enrollment.service.spec.ts (Task 4: new)
  enrollment/enrollment.controller.ts   (Task 4: adds GET /enrollments)
apps/web/                          (Task 5: create-next-app scaffold)
  next.config.ts                   (Task 5: rewrites)
  vitest.config.mts                (Task 6)
  vitest.setup.ts                  (Task 6)
  src/proxy.ts                     (Task 9)
  src/lib/
    cn.ts                          (Task 6)
    catalog-params.ts, catalog-params.test.ts  (Task 6)
    enroll-errors.ts, enroll-errors.test.ts    (Task 6)
    seat-status.ts, seat-status.test.ts        (Task 6)
    format.ts                      (Task 6)
    api/client.ts, api/client.test.ts          (Task 7)
    api/server.ts                  (Task 8)
    identity.ts                    (Task 8)
  src/components/
    ui/button.tsx ui/badge.tsx ui/card.tsx ui/table.tsx ui/skeleton.tsx (Task 10)
    toast.tsx, toast.test.tsx      (Task 10)
    error-card.tsx                 (Task 10)
    site-nav.tsx                   (Task 11)
  src/app/
    globals.css                    (Task 10: design tokens)
    layout.tsx                     (Task 11)
    page.tsx                       (Task 11: redirect to /catalog)
    error.tsx                      (Task 11)
    login/page.tsx login/login-form.tsx (Task 11)
    catalog/page.tsx catalog/search-controls.tsx catalog/pagination.tsx
    catalog/loading.tsx catalog/error.tsx (Task 12)
    courses/[id]/page.tsx courses/[id]/enroll-button.tsx (with test)
    courses/[id]/loading.tsx courses/[id]/error.tsx courses/[id]/not-found.tsx (Task 13)
    enrollments/page.tsx enrollments/enrollment-actions.tsx enrollments/error.tsx (Task 14)
    sections/[id]/waitlist/page.tsx sections/[id]/waitlist/error.tsx (Task 15)
README.md                          (Task 16)
```

---

### Task 1: Archive the Angular app

**Files:**
- Move: `apps/web` to `apps/web-angular`
- Modify: `apps/web-angular/package.json` (name)
- Modify: `package.json` (root scripts)

- [ ] **Step 1: Move the directory**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
git mv apps/web apps/web-angular
```

- [ ] **Step 2: Rename the package**

In `apps/web-angular/package.json` change:

```json
  "name": "web",
```

to:

```json
  "name": "web-angular",
```

- [ ] **Step 3: Drop the root dev script**

In root `package.json` delete the line:

```json
    "dev:web": "pnpm --filter web start",
```

(Task 5 adds a new `dev:web` pointing at the Next.js app. The Angular app stays runnable via `pnpm --filter web-angular start`.)

- [ ] **Step 4: Refresh the lockfile**

```bash
pnpm install
```

Expected: exits 0, `pnpm-lock.yaml` updates the renamed importer.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "web: archive Angular app at apps/web-angular"
```

---

### Task 2: Shared types for the new surface

**Files:**
- Modify: `packages/shared/src/enrollment.ts`
- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/waitlist.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Extend enrollment.ts**

Two edits in `packages/shared/src/enrollment.ts`.

First, add `waitlistPosition` to the existing `EnrollmentResult` interface (the API's `EnrollmentResultDto` already returns it; the shared type lagged behind). After the `enrolledAt: string;` line add:

```ts
  /** 1-based waitlist position; present only when status is WAITLISTED. */
  waitlistPosition?: number;
```

Second, append at the end of the file:

```ts
/** Section summary nested in a MyEnrollment row. */
export interface MyEnrollmentSection {
  id: string;
  sectionNumber: string;
  instructorName: string;
  meetingPattern: string;
  room: string;
}

/** Course summary nested in a MyEnrollment row. */
export interface MyEnrollmentCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
}

/** Row in GET /api/enrollments (the current student's enrollments). */
export interface MyEnrollment {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** 1-based waitlist position; present only when status is WAITLISTED. */
  waitlistPosition?: number;
  section: MyEnrollmentSection;
  course: MyEnrollmentCourse;
}
```

- [ ] **Step 2: Create auth.ts**

`packages/shared/src/auth.ts`:

```ts
import { Role } from './enums';

/** Response of GET /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}
```

- [ ] **Step 3: Create waitlist.ts**

`packages/shared/src/waitlist.ts`:

```ts
/** Row in GET /api/sections/:id/waitlist (ADMIN/ADVISOR only). */
export interface WaitlistEntry {
  /** 1-based position in the waitlist (dense rank). */
  position: number;
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  /** When the student joined the waitlist (ISO 8601). */
  joinedAt: string;
}
```

- [ ] **Step 4: Export from index.ts**

`packages/shared/src/index.ts` becomes:

```ts
export * from './enums';
export * from './department';
export * from './catalog';
export * from './enrollment';
export * from './audit';
export * from './auth';
export * from './waitlist';
```

- [ ] **Step 5: Build and verify**

```bash
pnpm build:shared
```

Expected: exits 0, `packages/shared/dist/` contains `auth.js`, `auth.d.ts`, `waitlist.js`, `waitlist.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "shared: add AuthUser, MyEnrollment, WaitlistEntry types"
```

(Do NOT commit `packages/shared/dist`; it is gitignored on purpose.)

---

### Task 3: API GET /auth/me

**Files:**
- Create: `apps/api/src/auth/dto/me.dto.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/auth.service.spec.ts` (style mirrors `waitlist.service.spec.ts`: direct instantiation, hand mocks):

```ts
import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  describe('me', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('7d') } as any;

    it('returns the profile of the requested user', async () => {
      const profile = {
        id: 'u1',
        email: 'a@student.ucr.edu',
        firstName: 'Ada',
        lastName: 'Lovelace',
        roles: ['STUDENT'],
      };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(profile) },
      } as any;
      const svc = new AuthService({} as any, prisma, config);

      await expect(svc.me('u1')).resolves.toEqual(profile);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { id: true, email: true, firstName: true, lastName: true, roles: true },
      });
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new AuthService({} as any, prisma, config);

      await expect(svc.me('gone')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter api exec jest src/auth/auth.service.spec.ts
```

Expected: FAIL, `svc.me is not a function`.

- [ ] **Step 3: Implement AuthService.me**

In `apps/api/src/auth/auth.service.ts`, after the `logout` method and before the `// ── Private helpers` divider, add:

```ts
    // ── Me ──────────────────────────────────────────────
    async me(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, firstName: true, lastName: true, roles: true },
        });
        // A valid JWT for a deleted user: treat as logged out.
        if (!user) throw new UnauthorizedException();
        return user;
    }
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm --filter api exec jest src/auth/auth.service.spec.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Response DTO**

`apps/api/src/auth/dto/me.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: Role, isArray: true })
  roles!: Role[];
}
```

- [ ] **Step 6: Controller route**

In `apps/api/src/auth/auth.controller.ts`:

Change the `@nestjs/common` import to include `Get` and `UseGuards`:

```ts
import {
    Body,
    Controller,
    Get,
    Post,
    Res,
    HttpCode,
    Req, UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
```

Add these imports below the existing ones:

```ts
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './types/jwt-payload.interface';
import { MeResponseDto } from './dto/me.dto';
```

Add the route after the `logout` method, before `setTokenCookies`:

```ts
    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Profile of the logged-in user' })
    @ApiOkResponse({ type: MeResponseDto })
    me(@CurrentUser() user: JwtPayload): Promise<MeResponseDto> {
        return this.auth.me(user.sub);
    }
```

- [ ] **Step 7: Typecheck, full API tests, smoke boot**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/api
npx tsc --noEmit
npx jest --runInBand
```

Expected: tsc clean; all suites pass (WaitlistService 7 plus the new 2).

Smoke boot (the user's dev server holds :3000, so EADDRINUSE after "successfully started" is the pass signal):

```bash
timeout 30 npm run start 2>&1 | grep -E "successfully started|EADDRINUSE|AuthController"
```

Expected: `AuthController {/api/auth}` maps `GET /api/auth/me`, then EADDRINUSE.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth
git commit -m "api: GET /auth/me returns the logged-in user's profile"
```

---

### Task 4: API GET /enrollments (list mine)

**Files:**
- Create: `apps/api/src/enrollment/dto/my-enrollment.dto.ts`
- Create: `apps/api/src/enrollment/enrollment.service.spec.ts`
- Modify: `apps/api/src/enrollment/enrollment.service.ts`
- Modify: `apps/api/src/enrollment/enrollment.controller.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/enrollment/enrollment.service.spec.ts`:

```ts
import { EnrollmentStatus } from '@prisma/client';

import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
  describe('listMine', () => {
    const section = {
      id: 'sec-1',
      sectionNumber: '001',
      instructorName: 'Grace Hopper',
      meetingPattern: 'MWF 9:00-9:50',
      room: 'WCH 101',
      course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
    };

    it('maps rows and computes a dense rank for waitlisted ones', async () => {
      const rows = [
        {
          id: 'e1',
          status: EnrollmentStatus.WAITLISTED,
          enrolledAt: new Date('2026-06-01T10:00:00Z'),
          waitlistPosition: 7,
          section,
        },
        {
          id: 'e2',
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: new Date('2026-05-01T10:00:00Z'),
          waitlistPosition: null,
          section,
        },
      ];
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue(rows) },
      } as any;
      const waitlist = { computeRank: jest.fn().mockResolvedValue(3) } as any;
      const svc = new EnrollmentService(prisma, {} as any, waitlist);

      const result = await svc.listMine('stu-1');

      expect(prisma.enrollment.findMany).toHaveBeenCalledWith({
        where: { studentId: 'stu-1' },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          waitlistPosition: true,
          section: {
            select: {
              id: true,
              sectionNumber: true,
              instructorName: true,
              meetingPattern: true,
              room: true,
              course: { select: { id: true, code: true, title: true, credits: true } },
            },
          },
        },
      });
      expect(waitlist.computeRank).toHaveBeenCalledWith(prisma, 'sec-1', 7);
      expect(result).toEqual([
        {
          id: 'e1',
          status: EnrollmentStatus.WAITLISTED,
          enrolledAt: '2026-06-01T10:00:00.000Z',
          waitlistPosition: 3,
          section: {
            id: 'sec-1',
            sectionNumber: '001',
            instructorName: 'Grace Hopper',
            meetingPattern: 'MWF 9:00-9:50',
            room: 'WCH 101',
          },
          course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
        },
        {
          id: 'e2',
          status: EnrollmentStatus.ENROLLED,
          enrolledAt: '2026-05-01T10:00:00.000Z',
          waitlistPosition: undefined,
          section: {
            id: 'sec-1',
            sectionNumber: '001',
            instructorName: 'Grace Hopper',
            meetingPattern: 'MWF 9:00-9:50',
            room: 'WCH 101',
          },
          course: { id: 'crs-1', code: 'CS101', title: 'Intro to CS', credits: 4 },
        },
      ]);
    });

    it('returns an empty array for a student with no enrollments', async () => {
      const prisma = {
        enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;
      const svc = new EnrollmentService(prisma, {} as any, {} as any);

      await expect(svc.listMine('stu-2')).resolves.toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter api exec jest src/enrollment/enrollment.service.spec.ts
```

Expected: FAIL, `svc.listMine is not a function`.

- [ ] **Step 3: Response DTO**

`apps/api/src/enrollment/dto/my-enrollment.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';

// Matches the shared `MyEnrollment` interface structurally (same caveat
// as enroll.dto.ts: Prisma's EnrollmentStatus is nominally distinct).

export class MyEnrollmentSectionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  sectionNumber!: string;

  @ApiProperty()
  instructorName!: string;

  @ApiProperty()
  meetingPattern!: string;

  @ApiProperty()
  room!: string;
}

export class MyEnrollmentCourseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  credits!: number;
}

export class MyEnrollmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: EnrollmentStatus })
  status!: EnrollmentStatus;

  @ApiProperty()
  enrolledAt!: string;

  @ApiProperty({
    required: false,
    description: '1-based waitlist position; absent unless status is WAITLISTED.',
  })
  waitlistPosition?: number;

  @ApiProperty({ type: MyEnrollmentSectionDto })
  section!: MyEnrollmentSectionDto;

  @ApiProperty({ type: MyEnrollmentCourseDto })
  course!: MyEnrollmentCourseDto;
}
```

- [ ] **Step 4: Implement listMine**

In `apps/api/src/enrollment/enrollment.service.ts`:

Add to the dto imports:

```ts
import { EnrollDto, EnrollmentResultDto } from './dto/enroll.dto';
import { MyEnrollmentDto } from './dto/my-enrollment.dto';
```

Add the method after `findOne`:

```ts
  async listMine(studentId: string): Promise<MyEnrollmentDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        waitlistPosition: true,
        section: {
          select: {
            id: true,
            sectionNumber: true,
            instructorName: true,
            meetingPattern: true,
            room: true,
            course: { select: { id: true, code: true, title: true, credits: true } },
          },
        },
      },
    });

    return Promise.all(
      rows.map(async (row) => {
        let waitlistPosition: number | undefined;
        if (row.status === EnrollmentStatus.WAITLISTED && row.waitlistPosition != null) {
          waitlistPosition = await this.waitlist.computeRank(
            this.prisma,
            row.section.id,
            row.waitlistPosition,
          );
        }
        const { course, ...section } = row.section;
        return {
          id: row.id,
          status: row.status,
          enrolledAt: row.enrolledAt.toISOString(),
          waitlistPosition,
          section,
          course,
        };
      }),
    );
  }
```

- [ ] **Step 5: Run the test, confirm it passes**

```bash
pnpm --filter api exec jest src/enrollment/enrollment.service.spec.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Controller route**

In `apps/api/src/enrollment/enrollment.controller.ts`:

Extend the dto import:

```ts
import { EnrollDto, EnrollFailureDto, EnrollmentResultDto } from './dto/enroll.dto';
import { MyEnrollmentDto } from './dto/my-enrollment.dto';
```

Add the route as the FIRST route in the class (above `enroll`); the class-level `@Roles('STUDENT')` already applies:

```ts
  @Get()
  @ApiOperation({ summary: "List the current student's enrollments, newest first" })
  @ApiOkResponse({ type: MyEnrollmentDto, isArray: true })
  listMine(@CurrentUser() user: JwtPayload): Promise<MyEnrollmentDto[]> {
    return this.enrollmentService.listMine(user.sub);
  }
```

- [ ] **Step 7: Typecheck, full tests, smoke boot**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/api
npx tsc --noEmit
npx jest --runInBand
timeout 30 npm run start 2>&1 | grep -E "successfully started|EADDRINUSE|EnrollmentController"
```

Expected: tsc clean, all tests pass, route map shows `GET /api/enrollments`, then EADDRINUSE.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/enrollment
git commit -m "api: GET /enrollments lists the current student's enrollments"
```

---

### Task 5: Scaffold the Next.js app

**Files:**
- Create: `apps/web/` (create-next-app output)
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`
- Modify: root `package.json`

- [ ] **Step 1: Scaffold**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps
pnpm dlx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --turbopack --import-alias "@/*" --skip-install --disable-git --yes
```

Expected: `apps/web` with `src/app/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`.

- [ ] **Step 2: Clean scaffold noise**

create-next-app (Next 16) generates `AGENTS.md` and a `CLAUDE.md` pointing at it; this repo has its own docs. Remove them if present, plus any stray lockfile:

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
rm -f AGENTS.md CLAUDE.md pnpm-lock.yaml package-lock.json
```

- [ ] **Step 3: Wire the package**

In `apps/web/package.json`:
- confirm `"name": "web"`;
- set the dev script to pin the port: `"dev": "next dev --turbopack -p 3001"`;
- add the workspace dependency:

```json
  "dependencies": {
    "@enroll/shared": "workspace:*",
    ...existing react and next deps stay...
  }
```

- [ ] **Step 4: Rewrites**

Replace `apps/web/next.config.ts` with:

```ts
import type { NextConfig } from 'next';

// Server-side base URL of the NestJS API. The same default lives in
// src/lib/api/server.ts; next.config cannot import from src.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Root wiring and install**

In root `package.json` scripts, add back:

```json
    "dev:web": "pnpm --filter web dev",
```

Then from the repo root:

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
pnpm install
```

Expected: exits 0, `apps/web/node_modules/@enroll/shared` is a workspace symlink.

- [ ] **Step 6: Boot check**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
(pnpm --filter web dev > /tmp/web-dev.log 2>&1 &) && sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health
pkill -f "next dev" || true
```

Expected: first curl 200 (default Next page), second curl 200 (proves the rewrite reaches the NestJS `/api/health`). If the API dev server is not running, the second returns 500; note it and continue.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "web: scaffold Next.js 16 app with API rewrite proxy on port 3001"
```

---

### Task 6: Vitest setup and pure lib helpers

**Files:**
- Create: `apps/web/vitest.config.mts`, `apps/web/vitest.setup.ts`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/lib/catalog-params.ts`, `apps/web/src/lib/catalog-params.test.ts`
- Create: `apps/web/src/lib/enroll-errors.ts`, `apps/web/src/lib/enroll-errors.test.ts`
- Create: `apps/web/src/lib/seat-status.ts`, `apps/web/src/lib/seat-status.test.ts`
- Create: `apps/web/src/lib/format.ts`
- Modify: `apps/web/package.json` (test scripts)

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm --filter web add -D vitest @vitejs/plugin-react vite-tsconfig-paths happy-dom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Config**

`apps/web/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

In `apps/web/package.json` scripts add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: cn helper (no test, trivial)**

`apps/web/src/lib/cn.ts`:

```ts
/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Write failing tests for catalog-params**

`apps/web/src/lib/catalog-params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Department } from '@enroll/shared';

import { parseCatalogParams, serializeCatalogParams } from './catalog-params';

describe('parseCatalogParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseCatalogParams({})).toEqual({
      search: '',
      department: '',
      page: 1,
      limit: 20,
      sortBy: 'code',
    });
  });

  it('parses valid values and takes the first of repeated params', () => {
    expect(
      parseCatalogParams({
        search: ['algo', 'x'],
        department: 'CS',
        page: '3',
        limit: '50',
        sortBy: 'title',
      }),
    ).toEqual({ search: 'algo', department: Department.CS, page: 3, limit: 50, sortBy: 'title' });
  });

  it('defaults sortBy to relevance when searching', () => {
    expect(parseCatalogParams({ search: 'algo' }).sortBy).toBe('relevance');
  });

  it('rejects junk: bad department, page below 1, off-menu limit', () => {
    const p = parseCatalogParams({ department: 'NOPE', page: '-2', limit: '37' });
    expect(p.department).toBe('');
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
  });
});

describe('serializeCatalogParams', () => {
  it('omits defaults so URLs stay clean', () => {
    expect(
      serializeCatalogParams({ search: '', department: '', page: 1, limit: 20, sortBy: 'code' }),
    ).toBe('');
  });

  it('serializes non-defaults', () => {
    expect(
      serializeCatalogParams({ search: 'algo', department: Department.CS, page: 2, limit: 50, sortBy: 'relevance' }),
    ).toBe('search=algo&department=CS&page=2&limit=50&sortBy=relevance');
  });
});
```

- [ ] **Step 5: Run, confirm failure**

```bash
pnpm --filter web test
```

Expected: FAIL, cannot resolve `./catalog-params`.

- [ ] **Step 6: Implement catalog-params**

`apps/web/src/lib/catalog-params.ts`:

```ts
import { Department } from '@enroll/shared';
import type { CourseSortBy } from '@enroll/shared';

export interface CatalogParams {
  search: string;
  department: Department | '';
  page: number;
  limit: number;
  sortBy: CourseSortBy;
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;

type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseCatalogParams(sp: RawSearchParams): CatalogParams {
  const search = (first(sp.search) ?? '').slice(0, 200);

  const rawDept = first(sp.department) ?? '';
  const department = (Object.values(Department) as string[]).includes(rawDept)
    ? (rawDept as Department)
    : '';

  const page = Math.max(1, parseInt(first(sp.page) ?? '', 10) || 1);

  const rawLimit = parseInt(first(sp.limit) ?? '', 10);
  const limit = (PAGE_SIZES as readonly number[]).includes(rawLimit) ? rawLimit : 20;

  const rawSort = first(sp.sortBy);
  const sortBy: CourseSortBy =
    rawSort === 'code' || rawSort === 'title' || rawSort === 'relevance'
      ? rawSort
      : search
        ? 'relevance'
        : 'code';

  return { search, department, page, limit, sortBy };
}

export function serializeCatalogParams(p: CatalogParams): string {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.department) qs.set('department', p.department);
  if (p.page > 1) qs.set('page', String(p.page));
  if (p.limit !== 20) qs.set('limit', String(p.limit));
  if (p.sortBy !== 'code') qs.set('sortBy', p.sortBy);
  return qs.toString();
}
```

URLs round-trip: `serializeCatalogParams` always writes non-`code` sort values, and `parseCatalogParams` re-derives `relevance` from `search` when the param is absent.

- [ ] **Step 7: Write failing tests for enroll-errors and seat-status**

`apps/web/src/lib/enroll-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { enrollErrorMessage } from './enroll-errors';

describe('enrollErrorMessage', () => {
  it('maps every known failure code', () => {
    expect(enrollErrorMessage('ALREADY_ENROLLED', 'x')).toBe(
      'You are already enrolled in this section.',
    );
    expect(enrollErrorMessage('ALREADY_WAITLISTED', 'x')).toBe(
      'You are already on the waitlist for this section.',
    );
    expect(enrollErrorMessage('REGISTRATION_CLOSED', 'x')).toBe(
      'Registration is closed for this term.',
    );
    expect(enrollErrorMessage('SECTION_NOT_FOUND', 'x')).toBe('This section no longer exists.');
    expect(enrollErrorMessage('STUDENT_NOT_FOUND', 'x')).toBe(
      'Your student record could not be found.',
    );
    expect(enrollErrorMessage('SECTION_FULL', 'x')).toBe('This section is full.');
  });

  it('falls back to the API message for unknown codes', () => {
    expect(enrollErrorMessage('SOMETHING_NEW', 'api says hi')).toBe('api says hi');
    expect(enrollErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
```

`apps/web/src/lib/seat-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { seatStatus } from './seat-status';

describe('seatStatus', () => {
  it('is full at zero seats', () => {
    expect(seatStatus(0, 30)).toBe('full');
  });

  it('is nearly-full within 10 percent of capacity, minimum 2', () => {
    expect(seatStatus(3, 30)).toBe('nearly-full');
    expect(seatStatus(2, 10)).toBe('nearly-full');
    expect(seatStatus(1, 4)).toBe('nearly-full');
  });

  it('is open otherwise', () => {
    expect(seatStatus(4, 30)).toBe('open');
    expect(seatStatus(25, 30)).toBe('open');
  });
});
```

- [ ] **Step 8: Run, confirm failure, then implement**

```bash
pnpm --filter web test
```

Expected: FAIL on both new files.

`apps/web/src/lib/enroll-errors.ts`:

```ts
import type { EnrollFailureCode } from '@enroll/shared';

const MESSAGES: Record<EnrollFailureCode, string> = {
  SECTION_FULL: 'This section is full.',
  ALREADY_ENROLLED: 'You are already enrolled in this section.',
  ALREADY_WAITLISTED: 'You are already on the waitlist for this section.',
  REGISTRATION_CLOSED: 'Registration is closed for this term.',
  SECTION_NOT_FOUND: 'This section no longer exists.',
  STUDENT_NOT_FOUND: 'Your student record could not be found.',
};

export function enrollErrorMessage(code: string | undefined, fallback: string): string {
  return code && code in MESSAGES ? MESSAGES[code as EnrollFailureCode] : fallback;
}
```

`apps/web/src/lib/seat-status.ts`:

```ts
export type SeatStatus = 'open' | 'nearly-full' | 'full';

/** Bucket remaining seats for display. Nearly full means within 10 percent of capacity (at least 2 seats). */
export function seatStatus(seatsAvailable: number, capacity: number): SeatStatus {
  if (seatsAvailable <= 0) return 'full';
  if (seatsAvailable <= Math.max(2, Math.ceil(capacity * 0.1))) return 'nearly-full';
  return 'open';
}
```

`apps/web/src/lib/format.ts` (no test, thin Intl wrapper):

```ts
const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
```

- [ ] **Step 9: Run all web tests, confirm pass**

```bash
pnpm --filter web test
```

Expected: PASS, 3 files, 11 tests.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "web: vitest setup and catalog, enroll error, seat status helpers"
```

---

### Task 7: Client API wrapper with 401 refresh retry

**Files:**
- Create: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/src/lib/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/courses')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/courses',
      expect.objectContaining({ headers: expect.objectContaining({ 'content-type': 'application/json' }) }),
    );
  });

  it('refreshes once on 401 and replays the request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { message: 'Token refreshed' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/enrollments')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollments');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/enrollments');
  });

  it('redirects to /login when the refresh also fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}));
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    void apiFetch('/enrollments').catch(() => {});
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  });

  it('throws ApiError carrying status and body for non-401 failures', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { code: 'ALREADY_ENROLLED', message: 'nope' }),
    );

    const err = await apiFetch('/enrollments', { method: 'POST', body: '{}' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ code: 'ALREADY_ENROLLED', message: 'nope' });
    expect(err.message).toBe('nope');
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter web test src/lib/api/client.test.ts
```

Expected: FAIL, cannot resolve `./client`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/api/client.ts`:

```ts
// Browser-side API access. Everything goes through the same-origin
// /api rewrite so the HTTP-only auth cookies ride along automatically.

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

async function parseBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const opts: RequestInit = {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  };

  let res = await fetch(`/api${path}`, opts);

  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!refreshed.ok) {
      window.location.assign('/login');
      // Never settles: the page is navigating away and callers must not
      // flash error state during the redirect.
      return new Promise<T>(() => {});
    }
    res = await fetch(`/api${path}`, opts);
  }

  if (!res.ok) throw new ApiError(res.status, await parseBody(res));
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter web test src/lib/api/client.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api
git commit -m "web: apiFetch client wrapper with single 401 refresh retry"
```

---

### Task 8: Server fetch helper and identity

**Files:**
- Create: `apps/web/src/lib/api/server.ts`
- Create: `apps/web/src/lib/identity.ts`

These are thin compositions of `next/headers` and `fetch`; they are exercised by every RSC page and the boot checks, not unit tests.

- [ ] **Step 1: Server fetch helper**

`apps/web/src/lib/api/server.ts`:

```ts
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

// Server-to-server base URL (same default duplicated in next.config.ts,
// which cannot import from src/).
export const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * GET from the NestJS API inside a Server Component, forwarding the
 * incoming request's cookies.
 *
 * Careful: redirect() and notFound() throw control-flow errors. Never
 * call apiGet inside a try/catch that would swallow them.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/catalog');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API responded ${res.status} on GET ${path}`);

  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Identity**

`apps/web/src/lib/identity.ts`:

```ts
import { cookies } from 'next/headers';
import type { AuthUser } from '@enroll/shared';

import { API_URL } from './api/server';

/**
 * Who is logged in, or null. Does not redirect: the layout renders for
 * /login too, where a missing session is normal.
 */
export async function getIdentity(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.get('access_token')) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit
git add src/lib
git commit -m "web: server-side apiGet with cookie forwarding and getIdentity"
```

Expected: tsc clean.

---

### Task 9: Route guard and silent refresh (proxy.ts)

**Files:**
- Create: `apps/web/src/proxy.ts`

- [ ] **Step 1: Implement the proxy**

`apps/web/src/proxy.ts` (Next 16: this file replaces middleware.ts; the export must be named `proxy`):

```ts
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Session gate for every app route (matcher excludes /api, /login and
 * static assets):
 * - access_token present: pass through.
 * - only refresh_token present: refresh against the API, apply the new
 *   cookies to BOTH the response (browser) and the forwarded request
 *   (so this render's RSC fetches already carry the new access token).
 * - neither: redirect to /login?next=<original path>.
 */
export async function proxy(request: NextRequest) {
  if (request.cookies.has('access_token')) return NextResponse.next();

  const refreshToken = request.cookies.get('refresh_token')?.value;
  if (refreshToken) {
    const refreshed = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refresh_token=${refreshToken}` },
    });
    if (refreshed.ok) {
      const setCookies = refreshed.headers.getSetCookie();
      const newAccess = readSetCookieValue(setCookies, 'access_token');
      const newRefresh = readSetCookieValue(setCookies, 'refresh_token');

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(
        'cookie',
        `access_token=${newAccess ?? ''}; refresh_token=${newRefresh ?? refreshToken}`,
      );
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      for (const sc of setCookies) response.headers.append('set-cookie', sc);
      return response;
    }
  }

  const login = new URL('/login', request.url);
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target !== '/') login.searchParams.set('next', target);
  return NextResponse.redirect(login);
}

function readSetCookieValue(setCookies: string[], name: string): string | null {
  for (const sc of setCookies) {
    if (sc.startsWith(`${name}=`)) return sc.slice(name.length + 1).split(';')[0];
  }
  return null;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
};
```

- [ ] **Step 2: Manual verification**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
(pnpm --filter web dev > /tmp/web-dev.log 2>&1 &) && sleep 10
# No cookies: expect 307 to /login (next param dropped for root)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3001/
# No cookies, deep link: expect 307 to /login?next=%2Fcatalog%3Fpage%3D2
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3001/catalog?page=2"
# Login page itself: not matched, 200 (404 is also fine until Task 11 creates the page)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
pkill -f "next dev" || true
```

Expected: 307s pointing at `/login` with the `next` param as shown.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/proxy.ts
git commit -m "web: proxy.ts gates routes and silently refreshes expired sessions"
```

---

### Task 10: Design tokens and UI primitives

**Files:**
- Replace: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `table.tsx`, `skeleton.tsx`
- Create: `apps/web/src/components/toast.tsx`, `apps/web/src/components/toast.test.tsx`
- Create: `apps/web/src/components/error-card.tsx`

Design identity (locked in the spec): university registrar. Cream paper surface, dark ink, deep pine green as the institutional color, amber as the action accent, a serif display face (Fraunces, wired in Task 11) over Geist Sans body text, Geist Mono for course codes. Dense bordered tables, sharp 4px radii, no rounded-pill SaaS styling.

- [ ] **Step 1: Replace globals.css**

`apps/web/src/app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  /* Surfaces and text */
  --color-paper: #faf7f2;
  --color-card: #fffdf9;
  --color-ink: #211d19;
  --color-ink-soft: #6b6258;
  --color-line: #e4dccf;

  /* Institutional pine */
  --color-pine: #1e4d3b;
  --color-pine-dark: #143527;
  --color-pine-soft: #e2ede6;

  /* Action amber */
  --color-amber: #b45309;
  --color-amber-soft: #fdf0e0;

  /* Seat and status colors */
  --color-open: #1a7a43;
  --color-open-soft: #e2f2e8;
  --color-full: #b3261e;
  --color-full-soft: #f9e6e4;
  --color-wait: #6d28d9;
  --color-wait-soft: #efe9fb;

  /* Type */
  --font-display: var(--font-fraunces);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --radius-sm: 4px;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

- [ ] **Step 2: Button**

`apps/web/src/components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary:
    'bg-pine text-paper hover:bg-pine-dark disabled:bg-ink-soft border border-pine hover:border-pine-dark',
  ghost:
    'bg-transparent text-pine border border-pine/40 hover:border-pine hover:bg-pine-soft disabled:text-ink-soft disabled:border-line',
  danger:
    'bg-transparent text-full border border-full/40 hover:bg-full-soft hover:border-full disabled:text-ink-soft disabled:border-line',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium',
        'transition-colors disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Badge**

`apps/web/src/components/ui/badge.tsx`:

```tsx
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'pine' | 'amber' | 'open' | 'full' | 'wait' | 'neutral';

const tones: Record<BadgeTone, string> = {
  pine: 'bg-pine-soft text-pine-dark',
  amber: 'bg-amber-soft text-amber',
  open: 'bg-open-soft text-open',
  full: 'bg-full-soft text-full',
  wait: 'bg-wait-soft text-wait',
  neutral: 'bg-line/60 text-ink-soft',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Card, Table, Skeleton**

`apps/web/src/components/ui/card.tsx`:

```tsx
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-sm border border-line bg-card p-4', className)}>{children}</div>
  );
}
```

`apps/web/src/components/ui/table.tsx`:

```tsx
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-card">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-paper/60">{children}</tr>;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-semibold', className)} {...props} />;
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}
```

`apps/web/src/components/ui/skeleton.tsx`:

```tsx
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-line/70', className)} />;
}
```

- [ ] **Step 5: Write the failing toast test**

`apps/web/src/components/toast.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return (
    <button
      onClick={() => toast.push({ kind: 'success', title: 'Enrolled', detail: '12 of 30 seats taken.' })}
    >
      fire
    </button>
  );
}

describe('toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders a pushed toast and auto-dismisses it after 5 seconds', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText('fire'));
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
    expect(screen.getByText('12 of 30 seats taken.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5100));
    expect(screen.queryByText('Enrolled')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run, confirm failure**

```bash
pnpm --filter web test src/components/toast.test.tsx
```

Expected: FAIL, cannot resolve `./toast`.

- [ ] **Step 7: Implement the toast system**

`apps/web/src/components/toast.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ToastInput {
  kind: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const kindStyles: Record<ToastInput['kind'], string> = {
  success: 'border-open bg-open-soft text-open',
  error: 'border-full bg-full-soft text-full',
  info: 'border-wait bg-wait-soft text-wait',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn('rounded-sm border-l-4 bg-card p-3 shadow-md', kindStyles[t.kind])}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.detail && <p className="mt-0.5 text-xs text-ink-soft">{t.detail}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 8: Error card (shared by every error.tsx)**

`apps/web/src/components/error-card.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ErrorCard({ message, reset }: { message: string; reset: () => void }) {
  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="font-display text-lg font-semibold">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-soft">{message}</p>
      <Button variant="ghost" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
```

- [ ] **Step 9: Run all web tests, confirm pass**

```bash
pnpm --filter web test
```

Expected: PASS (catalog-params, enroll-errors, seat-status, client, toast).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src
git commit -m "web: registrar design tokens, UI primitives, toast system"
```

---

### Task 11: Layout, nav, login, home redirect

**Files:**
- Replace: `apps/web/src/app/layout.tsx`
- Replace: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/error.tsx`
- Create: `apps/web/src/components/site-nav.tsx`
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/login-form.tsx`
- Delete: leftover scaffold assets referenced by the default page (`src/app/page.module.css` if present; unused svgs in `public/` may stay)

- [ ] **Step 1: Root layout**

`apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';

import { SiteNav } from '@/components/site-nav';
import { ToastProvider } from '@/components/toast';
import { getIdentity } from '@/lib/identity';

import './globals.css';

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] });
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Enroll', template: '%s | Enroll' },
  description: 'UCR course registration',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const identity = await getIdentity();

  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <SiteNav identity={identity} />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Site nav**

`apps/web/src/components/site-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Role } from '@enroll/shared';
import type { AuthUser } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-sm px-2 py-1 text-sm font-medium transition-colors',
        active ? 'bg-pine-soft text-pine-dark' : 'text-paper/90 hover:bg-pine-dark',
      )}
    >
      {label}
    </Link>
  );
}

export function SiteNav({ identity }: { identity: AuthUser | null }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (pathname === '/login') return null;

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  const isStudent = identity?.roles.includes(Role.STUDENT) ?? false;
  const staffRole = identity?.roles.find((r) => r === Role.ADMIN || r === Role.ADVISOR);

  return (
    <header className="border-b-4 border-amber bg-pine">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/catalog" className="font-display text-xl font-bold text-paper">
          Enroll
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/catalog" label="Catalog" active={pathname.startsWith('/catalog')} />
          {isStudent && (
            <NavLink
              href="/enrollments"
              label="My enrollments"
              active={pathname.startsWith('/enrollments')}
            />
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {identity && (
            <span className="flex items-center gap-2 text-sm text-paper/90">
              {identity.firstName} {identity.lastName}
              {staffRole && <Badge tone="amber">{staffRole}</Badge>}
            </span>
          )}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-sm border border-paper/30 px-2 py-1 text-xs text-paper/90 hover:bg-pine-dark disabled:opacity-50"
          >
            {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Home redirect and root error boundary**

`apps/web/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/catalog');
}
```

Delete `apps/web/src/app/page.module.css` if create-next-app generated one.

`apps/web/src/app/error.tsx`:

```tsx
'use client';

import { ErrorCard } from '@/components/error-card';

export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
```

- [ ] **Step 4: Login page**

`apps/web/src/app/login/page.tsx`:

```tsx
import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

function sanitizeNext(next: string | undefined): string {
  // Internal paths only: no protocol-relative or absolute URLs.
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/catalog';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-center text-3xl font-bold text-pine-dark">Enroll</h1>
      <p className="mt-1 text-center text-sm text-ink-soft">UCR course registration</p>
      <LoginForm next={sanitizeNext(next)} />
    </div>
  );
}
```

`apps/web/src/app/login/login-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Full navigation so every RSC renders with the new cookies.
      window.location.assign(next);
      return;
    }
    setPending(false);
    setError(res.status === 401 ? 'Invalid email or password.' : 'Sign in failed. Try again.');
  }

  return (
    <Card className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-paper px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-sm border border-line bg-paper px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-full">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 5: Verify in the browser**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
(pnpm --filter web dev > /tmp/web-dev.log 2>&1 &) && sleep 10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
```

Expected: 200. Then a real check (requires the API on :3000): fetch a seeded student email:

```bash
psql "$(grep DATABASE_URL apps/api/.env | cut -d= -f2- | tr -d '\"')" -c "SELECT email FROM \"User\" WHERE 'STUDENT' = ANY(roles) LIMIT 1;"
```

Log in at `http://localhost:3001/login` with that email and password `password`. Expect: redirect to /catalog (which 404s until Task 12; the nav header with your name proves login worked). Stop the dev server.

```bash
pkill -f "next dev" || true
```

- [ ] **Step 6: Typecheck, lint, test, commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit && pnpm lint && pnpm test
git add -A
git commit -m "web: layout with identity-aware nav, login flow, home redirect"
```

---

### Task 12: Catalog

**Files:**
- Create: `apps/web/src/app/catalog/page.tsx`
- Create: `apps/web/src/app/catalog/search-controls.tsx`
- Create: `apps/web/src/app/catalog/pagination.tsx`
- Create: `apps/web/src/app/catalog/loading.tsx`
- Create: `apps/web/src/app/catalog/error.tsx`

- [ ] **Step 1: Page**

`apps/web/src/app/catalog/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginatedCoursesResponse } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { apiGet } from '@/lib/api/server';
import { parseCatalogParams, serializeCatalogParams } from '@/lib/catalog-params';
import { seatStatus } from '@/lib/seat-status';

import { Pagination } from './pagination';
import { SearchControls } from './search-controls';

export const metadata: Metadata = { title: 'Catalog' };

const seatTone = { open: 'open', 'nearly-full': 'amber', full: 'full' } as const;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseCatalogParams(await searchParams);
  const qs = serializeCatalogParams(params);
  const result = await apiGet<PaginatedCoursesResponse>(`/courses${qs ? `?${qs}` : ''}`);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">Course catalog</h1>
      <SearchControls initial={params} />

      {result.data.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">
          No courses match.{' '}
          <Link href="/catalog" className="text-pine underline">
            Clear filters
          </Link>
        </Card>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.data.map((course) => {
            const open = course.totalCapacity - course.totalEnrolled;
            const status = seatStatus(open, course.totalCapacity);
            return (
              <li key={course.id}>
                <Link href={`/courses/${course.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-pine">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-pine">{course.code}</span>
                      <Badge tone="neutral">{course.credits} cr</Badge>
                    </div>
                    <p className="font-display mt-1 font-semibold">{course.title}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                      {course.sectionCount} section{course.sectionCount === 1 ? '' : 's'}
                      <Badge tone={seatTone[status]}>
                        {status === 'full' ? 'Full' : `${open} open`}
                      </Badge>
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination params={params} total={result.total} totalPages={result.totalPages} />
    </div>
  );
}
```

- [ ] **Step 2: Search controls**

`apps/web/src/app/catalog/search-controls.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ALL_DEPARTMENTS, DEPARTMENT_LABELS } from '@enroll/shared';
import type { Department } from '@enroll/shared';

import type { CatalogParams } from '@/lib/catalog-params';
import { PAGE_SIZES, serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

const selectCls =
  'rounded-sm border border-line bg-card px-2 py-1.5 text-sm focus:border-pine focus:outline-none';

export function SearchControls({ initial }: { initial: CatalogParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initial.search);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(patch: Partial<CatalogParams>) {
    const qs = serializeCatalogParams({ ...initial, page: 1, ...patch });
    startTransition(() => router.replace(`/catalog${qs ? `?${qs}` : ''}`, { scroll: false }));
  }

  // Debounced search-as-you-type, 300ms, matching the old Angular UX.
  useEffect(() => {
    if (search === initial.search) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ search }), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div
      className={cn('mt-4 flex flex-wrap items-center gap-2', isPending && 'opacity-60')}
      role="search"
    >
      <input
        type="search"
        placeholder="Search courses"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64 rounded-sm border border-line bg-card px-2 py-1.5 text-sm focus:border-pine focus:outline-none"
      />
      <select
        aria-label="Department"
        value={initial.department}
        onChange={(e) => apply({ department: e.target.value as Department | '' })}
        className={selectCls}
      >
        <option value="">All departments</option>
        {ALL_DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort by"
        value={initial.sortBy}
        onChange={(e) => apply({ sortBy: e.target.value as CatalogParams['sortBy'] })}
        className={selectCls}
      >
        <option value="code">Sort: code</option>
        <option value="title">Sort: title</option>
        {initial.search && <option value="relevance">Sort: relevance</option>}
      </select>
      <select
        aria-label="Page size"
        value={initial.limit}
        onChange={(e) => apply({ limit: Number(e.target.value) })}
        className={selectCls}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} per page
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Pagination**

`apps/web/src/app/catalog/pagination.tsx`:

```tsx
import Link from 'next/link';

import type { CatalogParams } from '@/lib/catalog-params';
import { serializeCatalogParams } from '@/lib/catalog-params';
import { cn } from '@/lib/cn';

function PageLink({
  params,
  to,
  label,
  disabled,
}: {
  params: CatalogParams;
  to: number;
  label: string;
  disabled: boolean;
}) {
  const cls = cn(
    'rounded-sm border px-2 py-1 text-sm',
    disabled
      ? 'cursor-default border-line text-ink-soft/50'
      : 'border-pine/40 text-pine hover:bg-pine-soft',
  );
  if (disabled) return <span className={cls}>{label}</span>;
  const qs = serializeCatalogParams({ ...params, page: to });
  return (
    <Link href={`/catalog${qs ? `?${qs}` : ''}`} className={cls}>
      {label}
    </Link>
  );
}

export function Pagination({
  params,
  total,
  totalPages,
}: {
  params: CatalogParams;
  total: number;
  totalPages: number;
}) {
  if (total === 0) return null;
  const { page } = params;
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      <p className="text-xs text-ink-soft">
        Page {page} of {totalPages} ({total} courses)
      </p>
      <div className="flex gap-1">
        <PageLink params={params} to={1} label="First" disabled={page <= 1} />
        <PageLink params={params} to={page - 1} label="Prev" disabled={page <= 1} />
        <PageLink params={params} to={page + 1} label="Next" disabled={page >= totalPages} />
        <PageLink params={params} to={totalPages} label="Last" disabled={page >= totalPages} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Loading and error states**

`apps/web/src/app/catalog/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function CatalogLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-4 h-9 w-full max-w-2xl" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
```

`apps/web/src/app/catalog/error.tsx`:

```tsx
'use client';

import { ErrorCard } from '@/components/error-card';

export default function CatalogError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
```

- [ ] **Step 5: Verify in the browser**

With the API running on :3000:

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
(pnpm --filter web dev > /tmp/web-dev.log 2>&1 &) && sleep 10
```

Log in, then check at `http://localhost:3001/catalog`:
- courses render; typing in search updates the URL after a pause; department filter works; pagination moves; a shared URL like `/catalog?search=intro&department=CS` reloads with state intact.

```bash
pkill -f "next dev" || true
```

- [ ] **Step 6: Typecheck, lint, test, commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit && pnpm lint && pnpm test
git add src/app/catalog
git commit -m "web: catalog with debounced search, filters, pagination"
```

---

### Task 13: Course detail and enroll

**Files:**
- Create: `apps/web/src/app/courses/[id]/page.tsx`
- Create: `apps/web/src/app/courses/[id]/enroll-button.tsx`
- Create: `apps/web/src/app/courses/[id]/enroll-button.test.tsx`
- Create: `apps/web/src/app/courses/[id]/loading.tsx`
- Create: `apps/web/src/app/courses/[id]/error.tsx`
- Create: `apps/web/src/app/courses/[id]/not-found.tsx`

- [ ] **Step 1: Write the failing EnrollButton test**

`apps/web/src/app/courses/[id]/enroll-button.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/toast';
import { ApiError, apiFetch } from '@/lib/api/client';

import { EnrollButton } from './enroll-button';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiFetch: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const apiFetchMock = vi.mocked(apiFetch);

function renderButton(full = false) {
  return render(
    <ToastProvider>
      <EnrollButton sectionId="sec-1" full={full} />
    </ToastProvider>,
  );
}

describe('EnrollButton', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    refresh.mockReset();
  });

  it('labels by seat availability', () => {
    renderButton(false);
    expect(screen.getByRole('button', { name: 'Enroll' })).toBeInTheDocument();
  });

  it('labels full sections as join waitlist', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: 'Join waitlist' })).toBeInTheDocument();
  });

  it('shows enrolled state and refreshes on success', async () => {
    apiFetchMock.mockResolvedValueOnce({
      status: 'ENROLLED',
      sectionEnrolledCount: 12,
      sectionCapacity: 30,
    });
    const user = userEvent.setup();
    renderButton(false);

    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() => expect(screen.getByText('Enrolled')).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ sectionId: 'sec-1' }),
    });
  });

  it('shows the waitlist position when waitlisted', async () => {
    apiFetchMock.mockResolvedValueOnce({
      status: 'WAITLISTED',
      waitlistPosition: 4,
      sectionEnrolledCount: 30,
      sectionCapacity: 30,
    });
    const user = userEvent.setup();
    renderButton(true);

    await user.click(screen.getByRole('button', { name: 'Join waitlist' }));

    await waitFor(() => expect(screen.getByText('Waitlisted, #4 in line')).toBeInTheDocument());
  });

  it('maps failure codes to inline messages', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(409, { code: 'ALREADY_ENROLLED', message: 'raw api text' }),
    );
    const user = userEvent.setup();
    renderButton(false);

    await user.click(screen.getByRole('button', { name: 'Enroll' }));

    await waitFor(() =>
      expect(screen.getByText('You are already enrolled in this section.')).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
pnpm --filter web test src/app/courses
```

Expected: FAIL, cannot resolve `./enroll-button`.

- [ ] **Step 3: Implement EnrollButton**

`apps/web/src/app/courses/[id]/enroll-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EnrollmentResult } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';
import { enrollErrorMessage } from '@/lib/enroll-errors';

export function EnrollButton({ sectionId, full }: { sectionId: string; full: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<EnrollmentResult>('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ sectionId }),
      });
      if (result.status === 'WAITLISTED') {
        setDone(`Waitlisted, #${result.waitlistPosition} in line`);
        toast.push({
          kind: 'info',
          title: 'Added to waitlist',
          detail: `You are number ${result.waitlistPosition} in line for this section.`,
        });
      } else {
        setDone('Enrolled');
        toast.push({
          kind: 'success',
          title: 'Enrolled',
          detail: `${result.sectionEnrolledCount} of ${result.sectionCapacity} seats now taken.`,
        });
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? enrollErrorMessage(e.body?.code, e.message)
          : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (done) return <span className="text-sm font-semibold text-pine">{done}</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={full ? 'ghost' : 'primary'} onClick={enroll} disabled={pending}>
        {pending ? 'Working' : full ? 'Join waitlist' : 'Enroll'}
      </Button>
      {error && <p className="text-xs text-full">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter web test src/app/courses
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Page and route states**

`apps/web/src/app/courses/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@enroll/shared';
import type { CourseDetail } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { getIdentity } from '@/lib/identity';
import { seatStatus } from '@/lib/seat-status';

import { EnrollButton } from './enroll-button';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seatTone = { open: 'open', 'nearly-full': 'amber', full: 'full' } as const;

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [course, identity] = await Promise.all([
    apiGet<CourseDetail>(`/courses/${id}`),
    getIdentity(),
  ]);
  const roles = identity?.roles ?? [];
  const isStudent = roles.includes(Role.STUDENT);
  const isStaff = roles.includes(Role.ADMIN) || roles.includes(Role.ADVISOR);

  return (
    <div>
      <Link href="/catalog" className="text-xs text-pine underline">
        Back to catalog
      </Link>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-lg font-bold text-pine">{course.code}</span>
        <Badge tone="neutral">{course.credits} credits</Badge>
      </div>
      <h1 className="font-display mt-1 text-3xl font-bold text-pine-dark">{course.title}</h1>
      {course.description && (
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">{course.description}</p>
      )}

      <h2 className="font-display mt-8 text-lg font-semibold">Sections</h2>
      <div className="mt-3">
        <Table>
          <THead>
            <tr>
              <TH>Section</TH>
              <TH>Instructor</TH>
              <TH>Meets</TH>
              <TH>Room</TH>
              <TH>Seats</TH>
              <TH className="text-right">Action</TH>
            </tr>
          </THead>
          <TBody>
            {course.sections.map((s) => {
              const status = seatStatus(s.seatsAvailable, s.capacity);
              return (
                <TR key={s.id}>
                  <TD className="font-mono font-semibold">{s.sectionNumber}</TD>
                  <TD>{s.instructorName}</TD>
                  <TD>{s.meetingPattern}</TD>
                  <TD>{s.room}</TD>
                  <TD>
                    <Badge tone={seatTone[status]}>
                      {status === 'full'
                        ? 'Full'
                        : `${s.seatsAvailable} of ${s.capacity} open`}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {isStudent && <EnrollButton sectionId={s.id} full={status === 'full'} />}
                    {isStaff && (
                      <Link
                        href={`/sections/${s.id}/waitlist?course=${encodeURIComponent(course.code)}&section=${encodeURIComponent(s.sectionNumber)}`}
                        className="text-sm text-pine underline"
                      >
                        Waitlist
                      </Link>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
```

`apps/web/src/app/courses/[id]/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function CourseLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-96" />
      <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}
```

`apps/web/src/app/courses/[id]/error.tsx`:

```tsx
'use client';

import { ErrorCard } from '@/components/error-card';

export default function CourseError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
```

`apps/web/src/app/courses/[id]/not-found.tsx`:

```tsx
import Link from 'next/link';

import { Card } from '@/components/ui/card';

export default function CourseNotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="font-display text-lg font-semibold">Course not found</p>
      <p className="mt-2 text-sm text-ink-soft">It may have been removed from the active term.</p>
      <Link href="/catalog" className="mt-4 inline-block text-sm text-pine underline">
        Back to catalog
      </Link>
    </Card>
  );
}
```

- [ ] **Step 6: Verify in the browser**

Dev server up, logged in as a student: open a course from the catalog, enroll in an open section (toast, then seat count bumps after refresh), try enrolling again (inline "already enrolled" message). Stop the server.

- [ ] **Step 7: Typecheck, lint, test, commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit && pnpm lint && pnpm test
git add src/app/courses
git commit -m "web: course detail with sections table and enroll flow"
```

---

### Task 14: My enrollments

**Files:**
- Create: `apps/web/src/app/enrollments/page.tsx`
- Create: `apps/web/src/app/enrollments/enrollment-actions.tsx`
- Create: `apps/web/src/app/enrollments/error.tsx`

- [ ] **Step 1: Actions component (drop and leave waitlist, two-step confirm)**

`apps/web/src/app/enrollments/enrollment-actions.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EnrollmentStatus } from '@enroll/shared';
import type { EnrollmentResult } from '@enroll/shared';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';

export function EnrollmentActions({
  enrollmentId,
  status,
}: {
  enrollmentId: string;
  status: EnrollmentStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWaitlisted = status === EnrollmentStatus.WAITLISTED;
  const verb = isWaitlisted ? 'Leave waitlist' : 'Drop';

  async function drop() {
    setPending(true);
    setError(null);
    try {
      await apiFetch<EnrollmentResult>(`/enrollments/${enrollmentId}/drop`, { method: 'PATCH' });
      toast.push({
        kind: 'success',
        title: isWaitlisted ? 'Left the waitlist' : 'Dropped',
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {verb}
        </Button>
        {error && <p className="text-xs text-full">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-xs text-ink-soft">Sure?</span>
      <Button variant="danger" onClick={drop} disabled={pending}>
        {pending ? 'Working' : `Yes, ${verb.toLowerCase()}`}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Page**

`apps/web/src/app/enrollments/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { EnrollmentStatus } from '@enroll/shared';
import type { MyEnrollment } from '@enroll/shared';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';

import { EnrollmentActions } from './enrollment-actions';

export const metadata: Metadata = { title: 'My enrollments' };

const statusTone: Record<EnrollmentStatus, BadgeTone> = {
  [EnrollmentStatus.ENROLLED]: 'open',
  [EnrollmentStatus.WAITLISTED]: 'wait',
  [EnrollmentStatus.DROPPED]: 'neutral',
  [EnrollmentStatus.COMPLETED]: 'pine',
};

function EnrollmentRows({ rows, withActions }: { rows: MyEnrollment[]; withActions: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Status</TH>
          <TH>Course</TH>
          <TH>Section</TH>
          <TH>Meets</TH>
          <TH>Instructor</TH>
          {withActions && <TH className="text-right">Action</TH>}
        </tr>
      </THead>
      <TBody>
        {rows.map((e) => (
          <TR key={e.id}>
            <TD>
              <span className="flex items-center gap-1.5">
                <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                {e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null && (
                  <span className="text-xs text-wait">#{e.waitlistPosition} in line</span>
                )}
              </span>
            </TD>
            <TD>
              <Link href={`/courses/${e.course.id}`} className="hover:underline">
                <span className="font-mono font-semibold text-pine">{e.course.code}</span>{' '}
                {e.course.title}
              </Link>
            </TD>
            <TD className="font-mono">{e.section.sectionNumber}</TD>
            <TD>
              {e.section.meetingPattern}
              <span className="block text-xs text-ink-soft">{e.section.room}</span>
            </TD>
            <TD>{e.section.instructorName}</TD>
            {withActions && (
              <TD className="text-right">
                <EnrollmentActions enrollmentId={e.id} status={e.status} />
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export default async function EnrollmentsPage() {
  const rows = await apiGet<MyEnrollment[]>('/enrollments');
  const active = rows.filter(
    (e) => e.status === EnrollmentStatus.ENROLLED || e.status === EnrollmentStatus.WAITLISTED,
  );
  const past = rows.filter(
    (e) => e.status !== EnrollmentStatus.ENROLLED && e.status !== EnrollmentStatus.WAITLISTED,
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">My enrollments</h1>

      {active.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">
          You are not enrolled in anything yet.{' '}
          <Link href="/catalog" className="text-pine underline">
            Browse the catalog
          </Link>
        </Card>
      ) : (
        <div className="mt-6">
          <EnrollmentRows rows={active} withActions />
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
            Past enrollments ({past.length})
          </summary>
          <div className="mt-3">
            <EnrollmentRows rows={past} withActions={false} />
          </div>
        </details>
      )}
    </div>
  );
}
```

`apps/web/src/app/enrollments/error.tsx`:

```tsx
'use client';

import { ErrorCard } from '@/components/error-card';

export default function EnrollmentsError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
```

- [ ] **Step 3: Verify in the browser**

Logged in as a student with at least one enrollment (from Task 13's check): `/enrollments` lists it; Drop asks "Sure?", then the row moves to past after refresh; the nav link highlights.

- [ ] **Step 4: Typecheck, lint, test, commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit && pnpm lint && pnpm test
git add src/app/enrollments
git commit -m "web: my enrollments with drop and leave waitlist"
```

---

### Task 15: Section waitlist view (ADMIN/ADVISOR)

**Files:**
- Create: `apps/web/src/app/sections/[id]/waitlist/page.tsx`
- Create: `apps/web/src/app/sections/[id]/waitlist/error.tsx`

- [ ] **Step 1: Page**

`apps/web/src/app/sections/[id]/waitlist/page.tsx`:

(Access control: `apiGet` already redirects 403 to /catalog, so a student pasting this URL bounces. Course and section labels arrive as query params from the course detail link because the API has no GET /sections/:id; the table itself is always fetched fresh by id.)

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { WaitlistEntry } from '@enroll/shared';

import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Waitlist' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WaitlistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ course?: string; section?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { course, section } = await searchParams;

  const entries = await apiGet<WaitlistEntry[]>(`/sections/${id}/waitlist`);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-pine-dark">
        Waitlist{course ? ` for ${course}` : ''}
        {section ? ` section ${section}` : ''}
      </h1>
      <p className="mt-1 font-mono text-xs text-ink-soft">Section {id}</p>

      {entries.length === 0 ? (
        <Card className="mt-6 text-center text-sm text-ink-soft">No one is waiting.</Card>
      ) : (
        <div className="mt-6 max-w-2xl">
          <Table>
            <THead>
              <tr>
                <TH className="w-16">#</TH>
                <TH>Student</TH>
                <TH>Joined</TH>
              </tr>
            </THead>
            <TBody>
              {entries.map((e) => (
                <TR key={e.enrollmentId}>
                  <TD className="font-mono font-semibold text-wait">{e.position}</TD>
                  <TD>
                    {e.firstName} {e.lastName}
                  </TD>
                  <TD className="text-ink-soft">{formatDateTime(e.joinedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

`apps/web/src/app/sections/[id]/waitlist/error.tsx`:

```tsx
'use client';

import { ErrorCard } from '@/components/error-card';

export default function WaitlistError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message} reset={reset} />;
}
```

- [ ] **Step 2: Verify in the browser**

Find an admin email:

```bash
psql "$(grep DATABASE_URL apps/api/.env | cut -d= -f2- | tr -d '\"')" -c "SELECT email FROM \"User\" WHERE 'ADMIN' = ANY(roles) LIMIT 1;"
```

Log in as the admin (password `password`): course detail shows "Waitlist" links instead of enroll buttons; the waitlist page renders (likely "No one is waiting." until the Task 16 walkthrough); as a student, pasting the waitlist URL redirects to /catalog.

- [ ] **Step 3: Typecheck, lint, test, commit**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll/apps/web
npx tsc --noEmit && pnpm lint && pnpm test
git add src/app/sections
git commit -m "web: section waitlist view for admins and advisors"
```

---

### Task 16: README, full verification, walkthrough

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Three edits in the root `README.md`:

1. In the intro sentence, change "and an Angular web app" to "and a Next.js web app".

2. Replace the entire layout code block (the one listing `apps/` and `packages/`) with:

```markdown
apps/
  api/          NestJS, Prisma, Postgres
  web/          Next.js 16 (App Router, port 3001)
  web-angular/  Archived Angular 18 app (superseded by apps/web)
packages/
  shared/       Shared TypeScript types and enums
```

3. In the "Running the apps" section, change the Terminal 2 comment from `http://localhost:4200` to `http://localhost:3001 (proxies /api to the NestJS server)`.

- [ ] **Step 2: Full check across packages**

```bash
cd /Users/ricardozavala/WebstormProjects/enroll
pnpm build:shared
cd apps/api && npx tsc --noEmit && npx jest --runInBand && cd ../..
cd apps/web && npx tsc --noEmit && pnpm lint && pnpm test && pnpm build && cd ../..
```

Expected: everything green, `next build` completes. (`next build` needs no live API; rewrites resolve at request time.)

- [ ] **Step 3: End-to-end walkthrough (live API on :3000, web on :3001)**

Set up a tight section (capacity 2) for waitlist testing:

```bash
psql "$(grep DATABASE_URL apps/api/.env | cut -d= -f2- | tr -d '\"')" <<'SQL'
SELECT s.id AS section_id, c.code, s."sectionNumber"
FROM "Section" s JOIN "Course" c ON c.id = s."courseId"
LIMIT 1;
SQL
# then with the returned id:
# UPDATE "Section" SET capacity = 2, "enrolledCount" = 0 WHERE id = '<section_id>';
# DELETE FROM "Enrollment" WHERE "sectionId" = '<section_id>';
```

Walkthrough (use three seeded students and one admin; emails via `SELECT email FROM "User" WHERE 'STUDENT' = ANY(roles) LIMIT 3;`, password is `password` for everyone):
1. Student A: log in, find the course, enroll. Expect success toast, seats 1 of 2.
2. Student B (private window): enroll. Expect seats 2 of 2, section shows Full.
3. Student C (private window): enroll. Expect "Added to waitlist", number 1 in line; `/enrollments` shows WAITLISTED #1 with Leave waitlist.
4. Admin: open the section's waitlist page. Expect Student C at position 1.
5. Student A: drop from `/enrollments`. Within a few seconds (BullMQ promotion) Student C's `/enrollments` shows ENROLLED after a reload.
6. Student C: drop the promoted enrollment (cleanup).
7. Deep-link check: while logged out, open `http://localhost:3001/enrollments`. Expect login page, then return to /enrollments after signing in.
8. Silent refresh check: log in, delete the `access_token` cookie in devtools (keep `refresh_token`), reload /catalog. Expect a normal render with a fresh `access_token` cookie.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: point README at the Next.js web app"
```

---

## Self-review notes

- Spec coverage: repo moves (T1), API additions (T2-T4), proxy and hybrid rendering (T5, T8, T9), auth flows (T7, T9, T11), all six routes (T11-T15), error handling (T10-T15), design system (T10), testing (T3, T4, T6, T7, T10, T13), README and walkthrough (T16).
- The spec's JWT-decode-in-layout detail was dropped in favor of `/auth/me` alone; noted in the header.
- `SECTION_FULL` stays in the message map even though the API no longer returns it (it remains in `EnrollFailureCode` for back-compat).
