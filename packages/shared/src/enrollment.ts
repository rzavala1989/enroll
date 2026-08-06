import { EnrollmentStatus } from './enums';

/** Body for POST /api/enrollments. */
export interface EnrollRequest {
  /** Section the student is trying to enroll in. */
  sectionId: string;
  /**
   * Student id. In Phase 2 this is derived from the JWT and the body
   * field is dropped from the contract; for now the catalog passes it
   * explicitly while auth is deferred.
   */
  studentId: string;
}

/** Body for PATCH /api/enrollments/:id/drop. */
export interface DropRequest {
  studentId: string;
}

/** Successful enrollment response. */
export interface EnrollmentResult {
  id: string;
  studentId: string;
  sectionId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** 1-based waitlist position; present only when status is WAITLISTED. */
  waitlistPosition?: number;
  /** Latest enrolledCount on the section after the write succeeded. */
  sectionEnrolledCount: number;
  /** Section capacity (for UX hints). */
  sectionCapacity: number;
  /** When the enrollment was dropped (ISO 8601); present once dropped. */
  droppedAt?: string;
  /** When the enrollment was completed (ISO 8601); present once completed. */
  completedAt?: string;
}

/**
 * Specific failure modes the API surfaces. Distinguishing these lets
 * the UI tell the user "that section is full" vs "you already have a
 * conflict" without parsing a string.
 *
 * SECTION_FULL means every seat is taken AND the waitlist is at its
 * cap; a full section with waitlist space returns 201 WAITLISTED
 * instead.
 *
 * ALREADY_DROPPED comes from the drop path, not the enroll path: the
 * conditional status transition matched no row, meaning a racing
 * request (a double-click, a retry) already dropped this enrollment.
 */
export type EnrollFailureCode =
  | 'SECTION_FULL'
  | 'ALREADY_ENROLLED'
  | 'ALREADY_WAITLISTED'
  | 'ALREADY_DROPPED'
  | 'REGISTRATION_CLOSED'
  | 'SECTION_NOT_FOUND'
  | 'STUDENT_NOT_FOUND';

export interface EnrollFailure {
  code: EnrollFailureCode;
  message: string;
}

/** Section summary nested in a MyEnrollment row. */
export interface MyEnrollmentSection {
  id: string;
  sectionNumber: string;
  instructorName: string;
  meetingPattern: string;
  room: string;
}

/** Course summary nested in a MyEnrollment row. */
export interface MyEnrollmentCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
}

/**
 * Query parameters for GET /api/enrollments.
 *
 * All optional. Omitting everything returns the newest 100 rows of the
 * student's history, which is the whole thing for anyone short of a
 * career student.
 */
export interface ListMyEnrollmentsQuery {
  /** Restrict to these statuses. */
  status?: EnrollmentStatus | EnrollmentStatus[];
  /** 1-indexed page. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 100, capped at 200. */
  limit?: number;
}

/** Row in GET /api/enrollments (the current student's enrollments). */
export interface MyEnrollment {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** 1-based waitlist position; present only when status is WAITLISTED. */
  waitlistPosition?: number;
  section: MyEnrollmentSection;
  course: MyEnrollmentCourse;
}
