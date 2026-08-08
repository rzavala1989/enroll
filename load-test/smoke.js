/**
 * Smoke test: one student, one enrollment cycle.
 *
 * Verifies the API is up and the auth/enroll/drop flow works
 * before running heavier scenarios.
 *
 * Run:
 *   k6 run load-test/smoke.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

import { API_ROOT, BASE_URL } from './config.js';
import { authenticateStudents, setAuth } from './auth.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'],
    http_req_failed: ['rate==0.0'],
  },
};

export function setup() {
  const students = authenticateStudents(1);
  if (students.length === 0) {
    throw new Error('could not authenticate; is the API running and seeded?');
  }
  return { student: students[0] };
}

export default function (data) {
  const jar = http.cookieJar();
  setAuth(jar, data.student.token);

  let sectionId = null;
  let enrollmentId = null;

  group('health', () => {
    const res = http.get(`${API_ROOT}/health`, { tags: { name: 'health' } });
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  group('browse catalog', () => {
    const res = http.get(`${BASE_URL}/courses?limit=5`, { tags: { name: 'catalog' } });
    check(res, { 'catalog 200': (r) => r.status === 200 });

    if (res.status === 200) {
      const courses = JSON.parse(res.body).data;
      if (courses.length > 0) {
        const detail = http.get(`${BASE_URL}/courses/${courses[0].id}`, {
          tags: { name: 'detail' },
        });
        check(detail, { 'detail 200': (r) => r.status === 200 });

        if (detail.status === 200) {
          const sections = JSON.parse(detail.body).sections;
          // Pick a section with open seats.
          const open = sections.find((s) => s.seatsAvailable > 0);
          if (open) sectionId = open.id;
        }
      }
    }
  });

  if (!sectionId) {
    console.warn('no open section found, skipping enroll/drop');
    return;
  }

  group('enroll', () => {
    const res = http.post(`${BASE_URL}/enrollments`, JSON.stringify({ sectionId }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'enroll' },
    });
    check(res, { 'enroll 201': (r) => r.status === 201 });

    if (res.status === 201) {
      enrollmentId = JSON.parse(res.body).id;
    }
  });

  sleep(0.5);

  if (enrollmentId) {
    group('drop', () => {
      const res = http.patch(`${BASE_URL}/enrollments/${enrollmentId}/drop`, null, {
        tags: { name: 'drop' },
      });
      check(res, { 'drop 200': (r) => r.status === 200 });
    });
  }
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
