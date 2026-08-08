import { DEPARTMENT_LABELS } from '@enroll/shared';

export const DEPT_IMAGES: Record<string, string> = {
  CS: '/departments/cs.jpg',
  MATH: '/departments/math.jpg',
  ENGL: '/departments/engl.jpg',
  PHYS: '/departments/phys.jpg',
  BIOL: '/departments/biol.jpg',
  HIST: '/departments/hist.jpg',
  PSYC: '/departments/psyc.jpg',
  ECON: '/departments/econ.jpg',
};

export const DEPT_COLORS: Record<string, string> = {
  CS: 'var(--color-dept-cs)',
  MATH: 'var(--color-dept-math)',
  ENGL: 'var(--color-dept-engl)',
  PHYS: 'var(--color-dept-phys)',
  BIOL: 'var(--color-dept-biol)',
  HIST: 'var(--color-dept-hist)',
  PSYC: 'var(--color-dept-psyc)',
  ECON: 'var(--color-dept-econ)',
};

export function deptFromCode(code: string): string {
  return code.replace(/[0-9].*/, '');
}

export function deptLabel(dept: string): string {
  return DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS] ?? dept;
}
