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
}

/**
 * Specific failure modes the API surfaces. Distinguishing these lets
 * the UI tell the user "that section is full" vs "you already have a
 * conflict" without parsing a string.
 */
export type EnrollFailureCode =
  | 'SECTION_FULL'
  | 'ALREADY_ENROLLED'
  | 'ALREADY_WAITLISTED'
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
