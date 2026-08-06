import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

/**
 * Registration-day load profile.
 *
 * The question this answers is not "how many requests per second" but
 * "what does the FOR UPDATE strategy's tail latency look like when a
 * thousand students hit fifty one-seat sections at once". Pessimistic
 * locking is the right call for known-high-contention allocation, and
 * the cost it trades away is queueing on the lock. That cost is
 * invisible in unit tests and in any amount of code reading.
 *
 * What to watch:
 *   - enroll_p99 against enroll_p50. A widening gap is lock queueing.
 *   - seat_overcommit must stay at zero. Anything else is a correctness
 *     failure, not a performance one, and invalidates the run.
 *   - http_req_failed excluding the expected 409s.
 *
 * Run:
 *   BASE_URL=http://localhost:3000/api/v1 \
 *   SECTION_IDS=uuid,uuid,... \
 *   k6 run load/registration-day.js
 *
 * Seed first (`pnpm --filter api prisma db seed`) and pass real section
 * ids; the point is contention on a small set of sections.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const SECTION_IDS = (__ENV.SECTION_IDS || '').split(',').filter(Boolean);
const PASSWORD = __ENV.SEED_PASSWORD || 'password123';

const seatOvercommit = new Counter('seat_overcommit');
const enrolled = new Counter('outcome_enrolled');
const waitlisted = new Counter('outcome_waitlisted');
const rejected = new Counter('outcome_rejected');
const loginFailures = new Rate('login_failures');

export const options = {
  scenarios: {
    // Everyone refreshing the catalog at 8:59, then the 9:00 stampede.
    stampede: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 1000 },
        { duration: '2m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // A seat allocated past capacity is a hard failure of the run.
    seat_overcommit: ['count==0'],
    login_failures: ['rate<0.01'],
    'http_req_duration{endpoint:enroll}': ['p(95)<2000', 'p(99)<5000'],
    'http_req_duration{endpoint:catalog}': ['p(95)<500'],
  },
};

function login(vu) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: `student${vu % 50}@ucr.test`, password: PASSWORD }),
    { headers: { 'content-type': 'application/json' }, tags: { endpoint: 'login' } },
  );
  loginFailures.add(res.status !== 200);
  return res.status === 200;
}

export default function () {
  if (!login(__VU)) {
    sleep(1);
    return;
  }

  // Browse first, the way a real student does.
  const catalog = http.get(`${BASE_URL}/courses?page=1&limit=20`, {
    tags: { endpoint: 'catalog' },
  });
  check(catalog, { 'catalog ok': (r) => r.status === 200 });

  if (SECTION_IDS.length === 0) {
    sleep(1);
    return;
  }

  const sectionId = SECTION_IDS[__VU % SECTION_IDS.length];
  const res = http.post(`${BASE_URL}/enrollments`, JSON.stringify({ sectionId }), {
    headers: { 'content-type': 'application/json' },
    tags: { endpoint: 'enroll' },
  });

  if (res.status === 201 || res.status === 200) {
    const body = res.json();
    if (body.status === 'ENROLLED') {
      enrolled.add(1);
      if (body.sectionEnrolledCount > body.sectionCapacity) seatOvercommit.add(1);
    } else {
      waitlisted.add(1);
    }
  } else {
    rejected.add(1);
    check(res, {
      'rejection is a known code': (r) => [400, 409, 429].includes(r.status),
    });
  }

  sleep(Math.random() * 2);
}
