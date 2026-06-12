import type { EnrollFailureCode } from '@enroll/shared';

const MESSAGES: Record<EnrollFailureCode, string> = {
  SECTION_FULL: 'This section is full.',
  ALREADY_ENROLLED: 'You are already enrolled in this section.',
  ALREADY_WAITLISTED: 'You are already on the waitlist for this section.',
  REGISTRATION_CLOSED: 'Registration is closed for this term.',
  SECTION_NOT_FOUND: 'This section no longer exists.',
  STUDENT_NOT_FOUND: 'Your student record could not be found.',
};

export function enrollErrorMessage(code: string | undefined, fallback: string): string {
  return code && code in MESSAGES ? MESSAGES[code as EnrollFailureCode] : fallback;
}
