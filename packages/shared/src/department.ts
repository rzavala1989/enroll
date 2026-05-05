/**
 * Course code prefixes recognized by the catalog. The string values
 * match the prefix portion of a course code (e.g. "CS" for "CS101"),
 * so the same constant can be used both as a filter token and as a
 * UI label.
 */
export enum Department {
  CS = 'CS',
  MATH = 'MATH',
  ENGL = 'ENGL',
  PHYS = 'PHYS',
  BIOL = 'BIOL',
  HIST = 'HIST',
  PSYC = 'PSYC',
  ECON = 'ECON',
}

/** All departments in display order. */
export const ALL_DEPARTMENTS: ReadonlyArray<Department> = [
  Department.CS,
  Department.MATH,
  Department.ENGL,
  Department.PHYS,
  Department.BIOL,
  Department.HIST,
  Department.PSYC,
  Department.ECON,
];

/** Human-readable department names for UI. */
export const DEPARTMENT_LABELS: Readonly<Record<Department, string>> = {
  [Department.CS]: 'Computer Science',
  [Department.MATH]: 'Mathematics',
  [Department.ENGL]: 'English',
  [Department.PHYS]: 'Physics',
  [Department.BIOL]: 'Biology',
  [Department.HIST]: 'History',
  [Department.PSYC]: 'Psychology',
  [Department.ECON]: 'Economics',
};
