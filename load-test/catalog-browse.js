/**
 * Catalog browse: sustained read traffic across search and detail pages.
 *
 * Models students browsing the catalog during registration week.
 * Mixes department-filtered listing, full-text search, and section
 * detail views in roughly the ratio a real session produces.
 *
 * Run:
 *   k6 run --out 'web-dashboard=export=load-test/results/browse-report.html' load-test/catalog-browse.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

import { BASE_URL } from './config.js';
import { authenticateStudents, setAuth } from './auth.js';

const DEPARTMENTS = ['CS', 'MATH', 'ENGL', 'PHYS', 'BIOL', 'HIST', 'PSYC', 'ECON'];
const SEARCHES = [
  'intro',
  'calculus',
  'data',
  'systems',
  'psychology',
  'modern',
  'theory',
  'lab',
];

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:catalog-list}': ['p(95)<800'],
    'http_req_duration{name:catalog-search}': ['p(95)<800'],
    'http_req_duration{name:course-detail}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.98'],
  },
};

export function setup() {
  const students = authenticateStudents(5);
  return { students };
}

export default function (data) {
  const student = data.students[(__VU - 1) % data.students.length];
  const jar = http.cookieJar();
  setAuth(jar, student.token);

  const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
  const term = SEARCHES[Math.floor(Math.random() * SEARCHES.length)];

  group('department filter', () => {
    const res = http.get(`${BASE_URL}/courses?department=${dept}&limit=20`, {
      tags: { name: 'catalog-list' },
    });
    check(res, {
      'list 200': (r) => r.status === 200,
      'has data array': (r) => JSON.parse(r.body).data !== undefined,
    });

    // Drill into the first course.
    if (res.status === 200) {
      const courses = JSON.parse(res.body).data;
      if (courses.length > 0) {
        const pick = courses[Math.floor(Math.random() * courses.length)];
        const detail = http.get(`${BASE_URL}/courses/${pick.id}`, {
          tags: { name: 'course-detail' },
        });
        check(detail, {
          'detail 200': (r) => r.status === 200,
          'has sections': (r) => JSON.parse(r.body).sections !== undefined,
        });
      }
    }
  });

  sleep(0.5);

  group('full-text search', () => {
    const res = http.get(`${BASE_URL}/courses?search=${term}&limit=10`, {
      tags: { name: 'catalog-search' },
    });
    check(res, {
      'search 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'load-test/results/browse-report.html': htmlReport(data),
    'load-test/results/browse-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
