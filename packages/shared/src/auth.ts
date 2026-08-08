import { Role } from './enums';

/** Response of GET /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  classStanding?: string | null;
  advisor?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface StudentProfileAdvisor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface StudentProfileHold {
  id: string;
  reason: string;
  advisorName: string;
  createdAt: string;
}

export interface StudentProfileTerm {
  id: string;
  name: string;
  enrolledCredits: number;
  enrolledCourses: number;
  waitlistedCourses: number;
  maxCredits: number;
  overloadMaxCredits: number | null;
}

/** Response of GET /api/auth/profile. */
export interface StudentProfile {
  classStanding: string | null;
  advisor: StudentProfileAdvisor | null;
  currentTerm: StudentProfileTerm | null;
  holds: StudentProfileHold[];
  completedCredits: number;
}
