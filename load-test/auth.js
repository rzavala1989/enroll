import http from 'k6/http';
import { BASE_URL, PASSWORD, STUDENT_COUNT, studentEmail } from './config.js';

export function authenticateStudents(count) {
  const n = count || STUDENT_COUNT;
  const students = [];

  for (let i = 1; i <= n; i++) {
    const email = studentEmail(i);
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
    );

    if (res.status !== 200) {
      console.warn(`login failed for ${email}: ${res.status} ${res.body}`);
      continue;
    }

    const cookie = res.cookies['access_token'];
    if (!cookie || !cookie[0]) {
      console.warn(`no access_token cookie for ${email}`);
      continue;
    }

    students.push({ email, token: cookie[0].value });
  }

  console.log(`authenticated ${students.length}/${n} students`);
  return students;
}

export function setAuth(jar, token) {
  jar.set(BASE_URL, 'access_token', token);
}
