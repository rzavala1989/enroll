/**
 * Idempotent dev seed.
 *
 * Wipes Enrollment, Section, Course, Term, User in dependency order
 * and reinserts a realistic set of data: one Fall 2026 term, 152
 * courses spread across 8 departments with 1-3 sections apiece, 1027
 * users (1000 students each assigned one of 25 advisors, 2 admins), a
 * real Enrollment for every student's course load (enrolled, some
 * waitlisted where demand exceeds capacity, a few dropped), and a
 * handful of waitlist-promotion and waitlist-expiry Notifications.
 *
 * Run via: `pnpm --filter api prisma db seed`
 *
 * Curriculum design.
 *
 * Each department defines 19 unique courses, stratified by level so
 * the course code reflects the title's place in the curriculum:
 *
 *   • 100-level (4 courses): introductory survey courses
 *   • 200-level (6 courses): core foundational courses
 *   • 300-level (6 courses): upper-division electives
 *   • 400-level (3 courses): advanced / senior topics
 *
 * Codes within each level are stable across runs (101, 110, 120, 150
 * for 100-level, etc.), and titles are paired with a code by index, so
 * "Intro to X" is always 100-level and "Advanced X" is always 400.
 */

import { faker } from '@faker-js/faker';
import {
  ClassStanding,
  EnrollmentStatus,
  PrismaClient,
  Role,
  Season,
} from '@prisma/client';
import { ALL_DEPARTMENTS, Department } from '@enroll/shared';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

faker.seed(42);

/**
 * The single source of truth, imported rather than restated.
 *
 * This list previously existed three times: here, in
 * packages/shared/src/department.ts, and implicitly in the query DTO's
 * validation against the Department enum. Nothing kept them in step, so
 * adding a department to the catalog filter without adding it here
 * produced a filter that always returns zero courses.
 */
const DEPARTMENTS = ALL_DEPARTMENTS;

/** Code suffixes per level. Index in this array becomes the slot index. */
const CODE_NUMBERS = {
  '100': [101, 110, 120, 150],
  '200': [201, 210, 220, 230, 240, 250],
  '300': [301, 310, 320, 330, 340, 350],
  '400': [410, 430, 460],
} as const;

/**
 * 19 unique titles per department in curriculum order: 4 intro, 6 core,
 * 6 upper-division, 3 advanced.
 */
const TITLES_BY_DEPT: Record<Department, string[]> = {
  CS: [
    // 100
    'Intro to Computer Science',
    'Programming Fundamentals',
    'Discrete Foundations',
    'Computational Thinking',
    // 200
    'Data Structures',
    'Algorithms I',
    'Computer Architecture',
    'Software Engineering',
    'Programming Languages',
    'Databases',
    // 300
    'Operating Systems',
    'Computer Networks',
    'Algorithms II',
    'Compilers',
    'Computer Graphics',
    'Human-Computer Interaction',
    // 400
    'Distributed Systems',
    'Machine Learning',
    'Cryptography and Security',
  ],
  MATH: [
    'Calculus I',
    'Calculus II',
    'Discrete Mathematics',
    'College Algebra',
    'Multivariable Calculus',
    'Linear Algebra',
    'Differential Equations',
    'Probability Theory',
    'Numerical Methods',
    'Combinatorics',
    'Real Analysis',
    'Mathematical Statistics',
    'Number Theory',
    'Mathematical Logic',
    'Complex Analysis',
    'Vector Calculus',
    'Abstract Algebra',
    'Topology',
    'Measure Theory',
  ],
  ENGL: [
    'Composition I',
    'Composition II',
    'Introduction to Literature',
    'Reading the Essay',
    'World Literature',
    'American Literature',
    'British Literature',
    'Drama and Performance',
    'The Novel',
    'Modern Poetry',
    'Shakespeare',
    'Creative Writing: Fiction',
    'Creative Writing: Poetry',
    'Technical Writing',
    'Rhetoric and Argumentation',
    'Postcolonial Literature',
    'Literary Theory',
    'Contemporary Fiction',
    'Advanced Workshop',
  ],
  PHYS: [
    'General Physics I',
    'General Physics II',
    'Physics for Scientists',
    'Physics of Everyday Life',
    'Modern Physics',
    'Classical Mechanics',
    'Electromagnetism',
    'Thermodynamics',
    'Optics',
    'Mathematical Methods of Physics',
    'Quantum Mechanics',
    'Statistical Mechanics',
    'Astrophysics',
    'Solid State Physics',
    'Experimental Physics Lab',
    'Computational Physics',
    'Particle Physics',
    'Nuclear Physics',
    'General Relativity',
  ],
  BIOL: [
    'Intro to Biology',
    'Cell Biology',
    'Human Biology',
    'Plants and Society',
    'Genetics',
    'Microbiology',
    'Anatomy and Physiology',
    'Ecology',
    'Biochemistry',
    'Plant Biology',
    'Molecular Biology',
    'Evolutionary Biology',
    'Marine Biology',
    'Developmental Biology',
    'Bioinformatics',
    'Histology',
    'Neuroscience',
    'Immunology',
    'Systems Biology',
  ],
  HIST: [
    'World History to 1500',
    'World History since 1500',
    'United States History I',
    'United States History II',
    'Ancient Greece and Rome',
    'Medieval Europe',
    'Renaissance and Reformation',
    'Modern Europe',
    'Latin American History',
    'East Asian History',
    'Middle Eastern History',
    'African History',
    'History of Science',
    'Cold War Era',
    'Public History',
    'American Civil War',
    'Twentieth-Century Conflicts',
    'Historiography',
    'Senior Research Seminar',
  ],
  PSYC: [
    'Intro to Psychology',
    'Lifespan Development',
    'Mind and Brain',
    'Psychology of Everyday Life',
    'Developmental Psychology',
    'Social Psychology',
    'Cognitive Psychology',
    'Statistics for Psychology',
    'Research Methods',
    'Psychology of Language',
    'Abnormal Psychology',
    'Personality Theory',
    'Behavioral Neuroscience',
    'Sensation and Perception',
    'Learning and Memory',
    'Health Psychology',
    'Clinical Psychology',
    'Industrial-Organizational Psychology',
    'Capstone Seminar',
  ],
  ECON: [
    'Principles of Microeconomics',
    'Principles of Macroeconomics',
    'Economic Statistics',
    'Economics in the News',
    'Intermediate Microeconomics',
    'Intermediate Macroeconomics',
    'Money and Banking',
    'International Trade',
    'Labor Economics',
    'Public Economics',
    'Game Theory',
    'Industrial Organization',
    'Behavioral Economics',
    'Environmental Economics',
    'Development Economics',
    'International Finance',
    'Econometrics',
    'Economic History',
    'Senior Thesis',
  ],
};

const MEETING_PATTERNS = [
  'MWF 8:00-8:50',
  'MWF 9:00-9:50',
  'MWF 10:00-10:50',
  'MWF 11:00-11:50',
  'MWF 1:00-1:50',
  'TR 8:00-9:15',
  'TR 9:30-10:45',
  'TR 11:00-12:15',
  'TR 1:30-2:45',
  'TR 3:00-4:15',
];

const ROOMS = [
  'Olmsted 1129',
  'Olmsted 1409',
  'Sproul 1102',
  'Watkins 1101',
  'Watkins 2101',
  'Pierce 1101',
  'Pierce 2278',
  'Bourns A125',
  'Bourns A265',
  'HMNSS 1500',
  'HMNSS 1502',
  'INTS 1113',
  'INTS 1128',
  'Webber 1000',
  'Skye 175',
];

/** Build the canonical (level, code, title) sequence for a department. */
function coursesFor(dept: Department): Array<{
  code: string;
  title: string;
  level: 100 | 200 | 300 | 400;
}> {
  const titles = TITLES_BY_DEPT[dept];
  const out: Array<{
    code: string;
    title: string;
    level: 100 | 200 | 300 | 400;
  }> = [];

  let titleIdx = 0;
  for (const lvl of ['100', '200', '300', '400'] as const) {
    for (const num of CODE_NUMBERS[lvl]) {
      const title = titles[titleIdx++];
      if (title === undefined) {
        throw new Error(
          `Missing title for ${dept} slot ${titleIdx - 1}; check TITLES_BY_DEPT length.`,
        );
      }
      out.push({
        code: `${dept}${num}`,
        title,
        level: Number(lvl) as 100 | 200 | 300 | 400,
      });
    }
  }
  return out;
}

/** Credits scale with level: lower-division leans 3, upper leans 4. */
function creditsForLevel(level: 100 | 200 | 300 | 400): number {
  if (level <= 200) return faker.helpers.arrayElement([3, 3, 3, 4]);
  if (level === 300) return faker.helpers.arrayElement([3, 4, 4, 4]);
  return faker.helpers.arrayElement([3, 4, 4, 5]);
}

/** Hosts a destructive seed is allowed to run against without an explicit override. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

const SEED_CONFIRM_PHRASE = 'yes-wipe-everything';

/**
 * Refuse to run anywhere the wipe below could be a catastrophe.
 *
 * `main` deletes every enrollment, section, course, term, and user
 * unconditionally. That is correct for a dev seed and one stray
 * DATABASE_URL away from being the worst afternoon of somebody's
 * career: nothing in the script previously looked at which database it
 * was pointed at.
 *
 * Two independent gates, either of which is enough to stop it, plus one
 * explicit override for the case where wiping a remote dev database is
 * genuinely what you meant.
 */
function refuse(reason: string): never {
  throw new Error(
    `Refusing to seed: ${reason}.\n` +
      `This seed deletes every user, course, section, term, and enrollment.\n` +
      `If you are certain, re-run with SEED_CONFIRM=${SEED_CONFIRM_PHRASE}.`,
  );
}

function assertSafeToWipe(): void {
  if (process.env.SEED_CONFIRM === SEED_CONFIRM_PHRASE) {
    console.warn(
      `SEED_CONFIRM=${SEED_CONFIRM_PHRASE} set: wiping the target database on request.`,
    );
    return;
  }

  if (process.env.NODE_ENV === 'production') refuse('NODE_ENV is production');

  const url = process.env.DATABASE_URL;
  if (!url) refuse('DATABASE_URL is not set');

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return refuse('DATABASE_URL could not be parsed, so its host is unknown');
  }

  if (!LOCAL_HOSTS.has(host)) {
    refuse(`database host "${host}" is not a known local host`);
  }
}

async function main(): Promise<void> {
  assertSafeToWipe();
  console.log('seeding...');

  await prisma.notification.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.overloadApproval.deleteMany({});
  await prisma.advisorHold.deleteMany({});
  await prisma.section.deleteMany({});
  await prisma.coursePrerequisite.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.registrationWindow.deleteMany({});
  await prisma.term.deleteMany({});
  await prisma.user.deleteMany({});

  // ── Fall 2026 term ────────────────────────────────────────────────
  const now = new Date();
  const closes = new Date(now);
  closes.setDate(closes.getDate() + 30);

  const fall2026 = await prisma.term.create({
    data: {
      season: Season.FALL,
      year: 2026,
      startDate: new Date('2026-08-31'),
      endDate: new Date('2026-12-12'),
      registrationOpens: now,
      registrationCloses: closes,
    },
  });

  // ── Priority registration windows ─────────────────────────────────
  // Seniors register first, freshmen last. All windows are in the past
  // so the seed works for immediate testing, but the stagger is visible
  // in the data.
  const standingOrder: Array<{ standing: ClassStanding; daysAgo: number }> = [
    { standing: ClassStanding.SENIOR, daysAgo: 7 },
    { standing: ClassStanding.JUNIOR, daysAgo: 5 },
    { standing: ClassStanding.SOPHOMORE, daysAgo: 3 },
    { standing: ClassStanding.FRESHMAN, daysAgo: 1 },
  ];
  for (const { standing, daysAgo } of standingOrder) {
    const opensAt = new Date(now);
    opensAt.setDate(opensAt.getDate() - daysAgo);
    await prisma.registrationWindow.create({
      data: { termId: fall2026.id, classStanding: standing, opensAt },
    });
  }
  console.log('  inserted 4 registration windows');

  // ── Spring 2026 term (past, closed) ────────────────────────────────
  // Students who completed courses in this term satisfy prerequisites
  // for Fall 2026. Registration is closed so nobody can enroll here;
  // the term exists only for its COMPLETED enrollment rows.
  const spring2026 = await prisma.term.create({
    data: {
      season: Season.SPRING,
      year: 2026,
      startDate: new Date('2026-01-06'),
      endDate: new Date('2026-05-16'),
      registrationOpens: new Date('2025-11-01'),
      registrationCloses: new Date('2025-12-15'),
    },
  });

  // ── Courses ───────────────────────────────────────────────────────
  const allCourses: Array<{ id: string; code: string; level: number }> = [];

  for (const dept of DEPARTMENTS) {
    for (const c of coursesFor(dept)) {
      const description = faker.lorem.sentences({ min: 2, max: 3 });
      const credits = creditsForLevel(c.level);
      const created = await prisma.course.create({
        data: {
          code: c.code,
          title: c.title,
          description,
          credits,
        },
      });
      allCourses.push({ id: created.id, code: c.code, level: c.level });
    }
  }
  console.log(`  inserted ${allCourses.length} courses`);

  // ── Prerequisites ────────────────────────────────────────────────
  // Each department's 200-level courses require at least one 100-level
  // course, 300-level require one 200-level, and 400-level require one
  // 300-level. This produces a realistic DAG without circular deps.
  const coursesByDept = new Map<string, typeof allCourses>();
  for (const c of allCourses) {
    const dept = c.code.replace(/\d+$/, '');
    const list = coursesByDept.get(dept) ?? [];
    list.push(c);
    coursesByDept.set(dept, list);
  }

  let prereqCount = 0;
  for (const [, courses] of coursesByDept) {
    const byLevel = {
      100: courses.filter((c) => c.level === 100),
      200: courses.filter((c) => c.level === 200),
      300: courses.filter((c) => c.level === 300),
      400: courses.filter((c) => c.level === 400),
    };

    // 200-level courses require the first 100-level course
    for (const c of byLevel[200]) {
      await prisma.coursePrerequisite.create({
        data: { courseId: c.id, prerequisiteId: byLevel[100][0].id },
      });
      prereqCount++;
    }

    // 300-level courses require the first 200-level course
    for (const c of byLevel[300]) {
      await prisma.coursePrerequisite.create({
        data: { courseId: c.id, prerequisiteId: byLevel[200][0].id },
      });
      prereqCount++;
    }

    // 400-level courses require the first 300-level course
    for (const c of byLevel[400]) {
      await prisma.coursePrerequisite.create({
        data: { courseId: c.id, prerequisiteId: byLevel[300][0].id },
      });
      prereqCount++;
    }
  }
  console.log(`  inserted ${prereqCount} prerequisites`);

  // ── Sections ──────────────────────────────────────────────────────
  // Lower-division courses tend to have more sections; upper-division
  // tends to have one. A small bias for realism.
  //
  // `enrolledCount` is not set here. It is a denormalized count of real
  // Enrollment rows, so faking it independently is exactly the kind of
  // drift the rest of this codebase works hard to prevent (see the
  // enrollment engine's locking discipline). It is patched to the true
  // count once the enrollments below exist.
  const allSections: Array<{
    id: string;
    capacity: number;
    level: 100 | 200 | 300 | 400;
    courseId: string;
    courseCode: string;
    sectionNumber: string;
  }> = [];
  for (const course of allCourses) {
    const numSections =
      course.level <= 200
        ? faker.number.int({ min: 2, max: 3 })
        : faker.number.int({ min: 1, max: 2 });

    for (let s = 1; s <= numSections; s++) {
      const capacity = faker.number.int({ min: 20, max: 30 });
      const sectionNumber = s.toString().padStart(3, '0');

      const created = await prisma.section.create({
        data: {
          courseId: course.id,
          termId: fall2026.id,
          sectionNumber,
          instructorName: `${faker.person.firstName()} ${faker.person.lastName()}`,
          meetingPattern: faker.helpers.arrayElement(MEETING_PATTERNS),
          room: faker.helpers.arrayElement(ROOMS),
          capacity,
        },
      });
      allSections.push({
        id: created.id,
        capacity,
        level: course.level as 100 | 200 | 300 | 400,
        courseId: course.id,
        courseCode: course.code,
        sectionNumber,
      });
    }
  }
  console.log(`  inserted ${allSections.length} sections`);

  // ── Users ─────────────────────────────────────────────────────────
  // Advisors first: students reference one by id, so the direction
  // that satisfies the FK has to run first. `createMany` cannot do
  // that in a single call because it never returns the generated ids,
  // so this whole section is individual creates instead of the bulk
  // insert an FK-free batch of users could otherwise use.
  const placeholderHash = await bcrypt.hash('password', 10);

  const advisors: Array<{ id: string }> = [];
  for (let i = 0; i < 25; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    advisors.push(
      await prisma.user.create({
        data: {
          email: `advisor${String(i + 1).padStart(2, '0')}@ucr.edu`,
          firstName,
          lastName,
          roles: [Role.ADVISOR],
          passwordHash: placeholderHash,
        },
      }),
    );
  }

  for (let i = 0; i < 2; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    await prisma.user.create({
      data: {
        email: `admin${String(i + 1).padStart(2, '0')}@ucr.edu`,
        firstName,
        lastName,
        roles: [Role.ADMIN],
        passwordHash: placeholderHash,
      },
    });
  }

  // Round-robin rather than random: every advisor ends up with 40
  // advisees instead of the lumpy distribution a random pick would
  // produce, and the ownership check in EnrollmentOwnershipGuard has
  // something to actually scope against for every advisor, not just
  // the lucky ones.
  // Standing distribution: 160 seniors, 280 juniors, 320 sophomores,
  // 240 freshmen. Roughly mirrors real attrition patterns and gives
  // every priority tier enough students to generate visible data.
  function standingFor(i: number): ClassStanding {
    if (i < 160) return ClassStanding.SENIOR;
    if (i < 440) return ClassStanding.JUNIOR;
    if (i < 760) return ClassStanding.SOPHOMORE;
    return ClassStanding.FRESHMAN;
  }

  const STUDENT_COUNT = 1000;
  const studentData = Array.from({ length: STUDENT_COUNT }, (_, i) => ({
    email: `student${String(i + 1).padStart(4, '0')}@student.ucr.edu`,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    roles: [Role.STUDENT],
    classStanding: standingFor(i),
    passwordHash: placeholderHash,
    advisorId: advisors[i % advisors.length].id,
  }));

  // Batch inserts: createMany is far faster than 1000 individual creates,
  // but does not return generated ids. Follow up with a single findMany.
  await prisma.user.createMany({ data: studentData });
  const studentRows = await prisma.user.findMany({
    where: { roles: { has: Role.STUDENT } },
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  const students = studentRows.map((r) => ({ id: r.id }));
  console.log(
    `  inserted ${students.length} students (each with an advisor), ` +
      `${advisors.length} advisors, 2 admins`,
  );

  // ── Advisor holds ─────────────────────────────────────────────────
  // Three active holds and two released ones. Active holds block
  // registration for those students; released holds show up in the
  // history without blocking anything.
  const holdReasons = [
    'Schedule a degree audit meeting before registering',
    'Outstanding tuition balance',
    'Missing immunization records',
    'Academic probation review required',
    'Incomplete course evaluation forms',
    'Financial aid verification pending',
    'Mandatory orientation not completed',
    'Transfer credit evaluation in progress',
  ];
  // Active holds on 15 freshmen near the end of the list.
  for (let i = 0; i < 15; i++) {
    const student = students[STUDENT_COUNT - 20 + i];
    const advisor = advisors[i % advisors.length];
    await prisma.advisorHold.create({
      data: {
        studentId: student.id,
        advisorId: advisor.id,
        reason: holdReasons[i % holdReasons.length],
      },
    });
  }
  // Released holds on 10 seniors.
  for (let i = 0; i < 10; i++) {
    const student = students[i];
    await prisma.advisorHold.create({
      data: {
        studentId: student.id,
        advisorId: advisors[i % advisors.length].id,
        reason: 'Degree audit required before senior registration',
        releasedAt: faker.date.recent({ days: 5 }),
      },
    });
  }
  console.log('  inserted 25 advisor holds (15 active, 10 released)');

  // ── Overload approvals ───────────────────────────────────────────
  // 20 seniors approved to take up to 21 credits.
  for (let i = 0; i < 20; i++) {
    const student = students[i];
    await prisma.overloadApproval.create({
      data: {
        studentId: student.id,
        termId: fall2026.id,
        approvedById: advisors[i % advisors.length].id,
        maxCredits: 21,
      },
    });
  }
  console.log('  inserted 20 overload approvals');

  // ── Spring 2026 sections and COMPLETED enrollments ────────────────
  // Every 100-level course gets one section in Spring 2026 so students
  // have a transcript history. Each student gets 3-4 COMPLETED
  // enrollments drawn from the 100-level pool, giving them the prereqs
  // they need for most 200-level Fall 2026 registrations.
  const spring100Courses = allCourses.filter((c) => c.level === 100);
  const springSections: Array<{ id: string; courseId: string }> = [];

  for (const course of spring100Courses) {
    const created = await prisma.section.create({
      data: {
        courseId: course.id,
        termId: spring2026.id,
        sectionNumber: '001',
        instructorName: `${faker.person.firstName()} ${faker.person.lastName()}`,
        meetingPattern: faker.helpers.arrayElement(MEETING_PATTERNS),
        room: faker.helpers.arrayElement(ROOMS),
        capacity: 50,
        enrolledCount: 0,
      },
    });
    springSections.push({ id: created.id, courseId: course.id });
  }

  let completedCount = 0;
  for (const student of students) {
    const numCompleted = faker.number.int({ min: 3, max: 4 });
    const picks = faker.helpers.arrayElements(springSections, numCompleted);
    for (const section of picks) {
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          sectionId: section.id,
          status: EnrollmentStatus.COMPLETED,
          completedAt: new Date('2026-05-16'),
        },
      });
      completedCount++;
    }
  }
  console.log(
    `  inserted ${springSections.length} spring sections, ` +
      `${completedCount} completed enrollments`,
  );

  // ── Enrollments ───────────────────────────────────────────────────
  // Fifty students cannot fill three hundred sections the way a real
  // student body fills a real course catalog: even six courses apiece
  // is only 300 seats claimed against roughly seven thousand available.
  // Real demand is not uniform either, so section choice is weighted
  // toward lower-level courses the way gen-ed and intro requirements
  // concentrate real enrollment. That is what lets a handful of
  // sections actually hit capacity and grow a waitlist instead of
  // every section sitting at a token few percent.
  const LEVEL_WEIGHT: Record<100 | 200 | 300 | 400, number> = {
    100: 5,
    200: 3,
    300: 2,
    400: 1,
  };
  const weightedSectionPool: (typeof allSections)[number][] = [];
  for (const section of allSections) {
    for (let w = 0; w < LEVEL_WEIGHT[section.level]; w++)
      weightedSectionPool.push(section);
  }

  const enrolledCounts = new Map<string, number>();
  const waitlistCounts = new Map<string, number>();
  const createdEnrollments: Array<{
    id: string;
    studentId: string;
    sectionId: string;
    courseId: string;
    courseCode: string;
    sectionNumber: string;
    status: EnrollmentStatus;
  }> = [];

  for (const student of students) {
    const wanted = faker.number.int({ min: 3, max: 6 });
    const picks = new Map<string, (typeof allSections)[number]>();
    // The pool is large relative to `wanted`, so collisions on distinct
    // sections are rare; the attempt cap just keeps a pathological draw
    // from looping instead of settling for fewer than `wanted`.
    for (let attempt = 0; picks.size < wanted && attempt < wanted * 20; attempt++) {
      const section = faker.helpers.arrayElement(weightedSectionPool);
      picks.set(section.id, section);
    }

    for (const section of picks.values()) {
      const enrolledSoFar = enrolledCounts.get(section.id) ?? 0;
      const isWaitlisted = enrolledSoFar >= section.capacity;

      const enrollment = await prisma.enrollment.create({
        data: isWaitlisted
          ? {
              studentId: student.id,
              sectionId: section.id,
              status: EnrollmentStatus.WAITLISTED,
              waitlistPosition: (waitlistCounts.get(section.id) ?? 0) + 1,
            }
          : {
              studentId: student.id,
              sectionId: section.id,
              status: EnrollmentStatus.ENROLLED,
            },
      });

      if (isWaitlisted) {
        waitlistCounts.set(section.id, (waitlistCounts.get(section.id) ?? 0) + 1);
      } else {
        enrolledCounts.set(section.id, enrolledSoFar + 1);
      }

      createdEnrollments.push({
        id: enrollment.id,
        studentId: student.id,
        sectionId: section.id,
        courseId: section.courseId,
        courseCode: section.courseCode,
        sectionNumber: section.sectionNumber,
        status: enrollment.status,
      });
    }
  }

  // The organic pass above is realistic but toothless: 50 students at
  // 3-6 courses each is ~225 total seat claims spread across roughly
  // 80 intro-level sections, so nothing ever climbs past a fifth of
  // capacity by chance alone. A real registration day has specific
  // sections everyone needs at once, so force that directly: the six
  // smallest 100-level sections each get walked through every student
  // (skipping anyone already in that section) until 5 land on the
  // waitlist. This is what gives the waitlist admin screen, the
  // waitlisted badge on the enrollments page, and the promotion/expiry
  // notifications below something real to show.
  const hotSections = allSections
    .filter((s) => s.level === 100)
    .sort((a, b) => a.capacity - b.capacity)
    .slice(0, 6);

  for (const section of hotSections) {
    const alreadyIn = new Set(
      createdEnrollments
        .filter((e) => e.sectionId === section.id)
        .map((e) => e.studentId),
    );
    const targetWaitlisted = 5;
    const shuffled = faker.helpers.shuffle([...students]);

    for (const student of shuffled) {
      if (alreadyIn.has(student.id)) continue;
      const waitlistedSoFar = waitlistCounts.get(section.id) ?? 0;
      if (waitlistedSoFar >= targetWaitlisted) break;

      const enrolledSoFar = enrolledCounts.get(section.id) ?? 0;
      const isWaitlisted = enrolledSoFar >= section.capacity;

      const enrollment = await prisma.enrollment.create({
        data: isWaitlisted
          ? {
              studentId: student.id,
              sectionId: section.id,
              status: EnrollmentStatus.WAITLISTED,
              waitlistPosition: waitlistedSoFar + 1,
            }
          : {
              studentId: student.id,
              sectionId: section.id,
              status: EnrollmentStatus.ENROLLED,
            },
      });

      if (isWaitlisted) {
        waitlistCounts.set(section.id, waitlistedSoFar + 1);
      } else {
        enrolledCounts.set(section.id, enrolledSoFar + 1);
      }
      alreadyIn.add(student.id);

      createdEnrollments.push({
        id: enrollment.id,
        studentId: student.id,
        sectionId: section.id,
        courseId: section.courseId,
        courseCode: section.courseCode,
        sectionNumber: section.sectionNumber,
        status: enrollment.status,
      });
    }
  }

  // A registered student who changes their mind before the term
  // starts: self-drops, so no notification (dropping is a direct
  // action, not something that happens to you). Pulled from the
  // enrolled set only, distinct from the waitlist-expiry drops below.
  const enrolledRows = createdEnrollments.filter(
    (e) => e.status === EnrollmentStatus.ENROLLED,
  );
  const selfDropped = faker.helpers.arrayElements(
    enrolledRows,
    Math.round(enrolledRows.length * 0.06),
  );
  for (const row of selfDropped) {
    await prisma.enrollment.update({
      where: { id: row.id },
      data: {
        status: EnrollmentStatus.DROPPED,
        droppedAt: faker.date.recent({ days: 3 }),
      },
    });
    row.status = EnrollmentStatus.DROPPED;
    enrolledCounts.set(row.sectionId, (enrolledCounts.get(row.sectionId) ?? 1) - 1);
  }

  // A handful of waitlist rows expire because registration closed
  // before a seat opened. This is the system removing the student, not
  // the student leaving, and it is the one drop flavor that gets a
  // notification (below).
  const waitlistedRows = createdEnrollments.filter(
    (e) => e.status === EnrollmentStatus.WAITLISTED,
  );
  const waitlistExpired = faker.helpers.arrayElements(
    waitlistedRows,
    Math.min(waitlistedRows.length, 6),
  );
  for (const row of waitlistExpired) {
    await prisma.enrollment.update({
      where: { id: row.id },
      data: {
        status: EnrollmentStatus.DROPPED,
        droppedAt: faker.date.recent({ days: 1 }),
        waitlistPosition: null,
      },
    });
    row.status = EnrollmentStatus.DROPPED;
  }

  // Patch every touched section to the real count of its ENROLLED rows.
  // Untouched sections keep the schema default of 0, which is already
  // correct: this term's registration just opened.
  for (const [sectionId, count] of enrolledCounts) {
    await prisma.section.update({
      where: { id: sectionId },
      data: { enrolledCount: count },
    });
  }

  const finalEnrolled = createdEnrollments.filter(
    (e) => e.status === EnrollmentStatus.ENROLLED,
  ).length;
  const finalWaitlisted = createdEnrollments.filter(
    (e) => e.status === EnrollmentStatus.WAITLISTED,
  ).length;
  const finalDropped = createdEnrollments.filter(
    (e) => e.status === EnrollmentStatus.DROPPED,
  ).length;
  console.log(
    `  inserted ${createdEnrollments.length} enrollments ` +
      `(${finalEnrolled} enrolled, ${finalWaitlisted} waitlisted, ${finalDropped} dropped)`,
  );

  // ── Notifications ─────────────────────────────────────────────────
  // Title and body copy mirrors waitlist.service.ts exactly (runPromotion
  // and expireSectionWaitlist) so a seeded notification is not
  // distinguishable from one the promotion or expiry job actually wrote.
  let notificationCount = 0;

  const promoted = faker.helpers.arrayElements(
    enrolledRows.filter((e) => e.status === EnrollmentStatus.ENROLLED),
    Math.min(enrolledRows.length, 20),
  );
  for (const row of promoted) {
    await prisma.notification.create({
      data: {
        userId: row.studentId,
        type: 'WAITLIST_PROMOTED',
        title: 'You were enrolled from the waitlist',
        body: `A seat opened in ${row.courseCode} section ${row.sectionNumber} and you were enrolled automatically.`,
        payload: {
          enrollmentId: row.id,
          sectionId: row.sectionId,
          courseId: row.courseId,
        },
        readAt: faker.datatype.boolean() ? faker.date.recent({ days: 2 }) : null,
        createdAt: faker.date.recent({ days: 5 }),
      },
    });
    notificationCount++;
  }

  for (const row of waitlistExpired) {
    await prisma.notification.create({
      data: {
        userId: row.studentId,
        type: 'WAITLIST_EXPIRED',
        title: 'Your waitlist spot expired',
        body: 'Registration closed before a seat opened, so you were removed from the waitlist.',
        payload: { enrollmentId: row.id, sectionId: row.sectionId },
        readAt: faker.datatype.boolean() ? faker.date.recent({ days: 1 }) : null,
        createdAt: faker.date.recent({ days: 1 }),
      },
    });
    notificationCount++;
  }
  console.log(`  inserted ${notificationCount} notifications`);

  console.log('done.');
}

// Bug 3 fix: setting exitCode rather than calling process.exit() so the
// .finally below runs to completion. process.exit halts the event loop
// synchronously and skips pending microtasks, which would leak the
// Prisma connection on any failure.
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
