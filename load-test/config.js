export const API_ROOT = __ENV.API_ROOT || 'http://localhost:3000/api';
export const BASE_URL = __ENV.API_URL || `${API_ROOT}/v1`;
export const STUDENT_COUNT = parseInt(__ENV.STUDENTS || '50', 10);
export const PASSWORD = 'password';

export function studentEmail(i) {
  return `student${String(i).padStart(2, '0')}@student.ucr.edu`;
}
