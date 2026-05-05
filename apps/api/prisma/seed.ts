/**
 * Idempotent dev seed.
 *
 * Wipes Enrollment, Section, Course, Term, User in dependency order
 * and reinserts a realistic set of data: one Fall 2026 term, 152
 * courses spread across 8 departments with 1-3 sections apiece, and
 * 57 users (50 students, 5 advisors, 2 admins).
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
import { PrismaClient, Role, Season } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

faker.seed(42);

const DEPARTMENTS = [
  'CS',
  'MATH',
  'ENGL',
  'PHYS',
  'BIOL',
  'HIST',
  'PSYC',
  'ECON',
] as const;

type Department = (typeof DEPARTMENTS)[number];

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

async function main(): Promise<void> {
  console.log('seeding...');

  await prisma.enrollment.deleteMany({});
  await prisma.section.deleteMany({});
  await prisma.course.deleteMany({});
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

  // ── Courses ───────────────────────────────────────────────────────
  const allCourses: Array<{ id: string; level: number }> = [];

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
      allCourses.push({ id: created.id, level: c.level });
    }
  }
  console.log(`  inserted ${allCourses.length} courses`);

  // ── Sections ──────────────────────────────────────────────────────
  // Lower-division courses tend to have more sections; upper-division
  // tends to have one. A small bias for realism.
  let sectionCount = 0;
  for (const course of allCourses) {
    const numSections =
      course.level <= 200
        ? faker.number.int({ min: 2, max: 3 })
        : faker.number.int({ min: 1, max: 2 });

    for (let s = 1; s <= numSections; s++) {
      const capacity = faker.number.int({
        min: course.level <= 200 ? 60 : 20,
        max: course.level <= 200 ? 150 : 60,
      });
      const enrolledCount = faker.number.int({
        min: 0,
        max: Math.floor(capacity * 0.9),
      });

      await prisma.section.create({
        data: {
          courseId: course.id,
          termId: fall2026.id,
          sectionNumber: s.toString().padStart(3, '0'),
          instructorName: `${faker.person.firstName()} ${faker.person.lastName()}`,
          meetingPattern: faker.helpers.arrayElement(MEETING_PATTERNS),
          room: faker.helpers.arrayElement(ROOMS),
          capacity,
          enrolledCount,
        },
      });
      sectionCount++;
    }
  }
  console.log(`  inserted ${sectionCount} sections`);

  // ── Users ─────────────────────────────────────────────────────────
  const placeholderHash = await bcrypt.hash('password', 10);

  const userRows: Array<{
    email: string;
    firstName: string;
    lastName: string;
    roles: Role[];
  }> = [];

  for (let i = 0; i < 50; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    userRows.push({
      email: faker.internet
        .email({ firstName, lastName, provider: 'student.ucr.edu' })
        .toLowerCase(),
      firstName,
      lastName,
      roles: [Role.STUDENT],
    });
  }
  for (let i = 0; i < 5; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    userRows.push({
      email: faker.internet
        .email({ firstName, lastName, provider: 'ucr.edu' })
        .toLowerCase(),
      firstName,
      lastName,
      roles: [Role.ADVISOR],
    });
  }
  for (let i = 0; i < 2; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    userRows.push({
      email: faker.internet
        .email({ firstName, lastName, provider: 'ucr.edu' })
        .toLowerCase(),
      firstName,
      lastName,
      roles: [Role.ADMIN],
    });
  }

  await prisma.user.createMany({
    data: userRows.map((u) => ({ ...u, passwordHash: placeholderHash })),
    skipDuplicates: true,
  });
  console.log(`  inserted ${userRows.length} users`);

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