import type { EnrollFailureCode } from '@enroll/shared';

const MESSAGES: Record<EnrollFailureCode, string> = {
  SECTION_FULL: 'This section is full.',
  ALREADY_ENROLLED: 'You are already enrolled in this section.',
  ALREADY_WAITLISTED: 'You are already on the waitlist for this section.',
  ALREADY_DROPPED: 'This enrollment was already dropped.',
  REGISTRATION_CLOSED: 'Registration is closed for this term.',
  SECTION_NOT_FOUND: 'This section no longer exists.',
  STUDENT_NOT_FOUND: 'Your student record could not be found.',
  PREREQUISITE_NOT_MET: 'You have not completed the prerequisite courses.',
  TIME_CONFLICT: 'This section conflicts with your existing schedule.',
  DUPLICATE_COURSE: 'You are already enrolled in another section of this course.',
  REGISTRATION_NOT_OPEN: 'Registration has not opened for your class standing yet.',
  ADVISOR_HOLD: 'You have an advisor hold. Contact your advisor to resolve it.',
  CREDIT_LIMIT_EXCEEDED: 'Adding this course would exceed your credit limit.',
  SWAP_TARGET_FULL: 'The target section has no available seats.',
};

export function enrollErrorMessage(code: string | undefined, fallback: string): string {
  return code && code in MESSAGES ? MESSAGES[code as EnrollFailureCode] : fallback;
}
