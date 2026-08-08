/**
 * Registration rush: every student enrolls in the same section at once.
 *
 * Simulates the 8:00 AM registration window opening. All VUs hit
 * POST /enrollments for a single high-demand section. The section row
 * lock serializes them: the first N get ENROLLED, the rest WAITLISTED.
 *
 * Run:
 *   k6 run --out 'web-dashboard=export=load-test/results/rush-report.html' load-test/registration-rush.js
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

import { BASE_URL, STUDENT_COUNT } from './config.js';
import { authenticateStudents, setAuth } from './auth.js';

const enrolled = new Counter('enroll_enrolled');
const waitlisted = new Counter('enroll_waitlisted');
const rejected = new Counter('enroll_rejected');
const enrollDuration = new Trend('enroll_duration', true);

export const options = {
  scenarios: {
    rush: {
      executor: 'per-vu-iterations',
      vus: STUDENT_COUNT,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.95'],
  },
};

export function setup() {
  const students = authenticateStudents();

  // Find a small intro section to target (highest contention).
  const jar = http.cookieJar();
  setAuth(jar, students[0].token);

  const catalog = http.get(`${BASE_URL}/courses?department=CS&limit=50`, {
    tags: { name: 'catalog' },
  });

  let targetSection = null;
  let targetCourse = null;

  if (catalog.status === 200) {
    const courses = JSON.parse(catalog.body).data;
    // Pick the first 100-level course (smallest sections, most contention).
    const intro = courses.find((c) => /1\d{2}$/.test(c.code));
    if (intro) {
      const detail = http.get(`${BASE_URL}/courses/${intro.id}`, {
        tags: { name: 'course-detail' },
      });
      if (detail.status === 200) {
        const parsed = JSON.parse(detail.body);
        // Pick the section with the smallest capacity.
        const sorted = parsed.sections.slice().sort((a, b) => a.capacity - b.capacity);
        targetSection = sorted[0];
        targetCourse = { id: parsed.id, code: parsed.code, title: parsed.title };
      }
    }
  }

  if (!targetSection) {
    console.error('could not find a target section; is the database seeded?');
    return { students, targetSectionId: null };
  }

  console.log(
    `target: ${targetCourse.code} section ${targetSection.sectionNumber} ` +
      `(capacity ${targetSection.capacity}, ${targetSection.enrolledCount} enrolled)`,
  );

  return {
    students,
    targetSectionId: targetSection.id,
    targetCapacity: targetSection.capacity,
    targetCode: targetCourse.code,
  };
}

export default function (data) {
  if (!data.targetSectionId) {
    console.error('no target section, skipping');
    return;
  }

  const idx = (__VU - 1) % data.students.length;
  const student = data.students[idx];

  const jar = http.cookieJar();
  setAuth(jar, student.token);

  group('enroll', () => {
    const res = http.post(
      `${BASE_URL}/enrollments`,
      JSON.stringify({ sectionId: data.targetSectionId }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'enroll' },
      },
    );

    enrollDuration.add(res.timings.duration);

    const ok = check(res, {
      'status is 201 or 200': (r) => r.status === 201 || r.status === 200,
    });

    if (ok) {
      const body = JSON.parse(res.body);
      if (body.status === 'ENROLLED') {
        enrolled.add(1);
      } else if (body.status === 'WAITLISTED') {
        waitlisted.add(1);
      }
    } else {
      rejected.add(1);
      if (res.status === 409 || res.status === 400) {
        // Expected: section full, already enrolled, etc.
        check(res, { 'expected rejection': () => true });
      }
    }
  });
}

export function handleSummary(data) {
  const enrolled = data.metrics.enroll_enrolled
    ? data.metrics.enroll_enrolled.values.count
    : 0;
  const waitlisted = data.metrics.enroll_waitlisted
    ? data.metrics.enroll_waitlisted.values.count
    : 0;
  const rejected = data.metrics.enroll_rejected
    ? data.metrics.enroll_rejected.values.count
    : 0;

  console.log(
    `\n  enrolled: ${enrolled}  waitlisted: ${waitlisted}  rejected: ${rejected}\n`,
  );

  return {
    'load-test/results/rush-report.html': htmlReport(data),
    'load-test/results/rush-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
