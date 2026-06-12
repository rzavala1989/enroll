import { describe, expect, it } from 'vitest';

import { enrollErrorMessage } from './enroll-errors';

describe('enrollErrorMessage', () => {
  it('maps every known failure code', () => {
    expect(enrollErrorMessage('ALREADY_ENROLLED', 'x')).toBe(
      'You are already enrolled in this section.',
    );
    expect(enrollErrorMessage('ALREADY_WAITLISTED', 'x')).toBe(
      'You are already on the waitlist for this section.',
    );
    expect(enrollErrorMessage('REGISTRATION_CLOSED', 'x')).toBe(
      'Registration is closed for this term.',
    );
    expect(enrollErrorMessage('SECTION_NOT_FOUND', 'x')).toBe('This section no longer exists.');
    expect(enrollErrorMessage('STUDENT_NOT_FOUND', 'x')).toBe(
      'Your student record could not be found.',
    );
    expect(enrollErrorMessage('SECTION_FULL', 'x')).toBe('This section is full.');
  });

  it('falls back to the API message for unknown codes', () => {
    expect(enrollErrorMessage('SOMETHING_NEW', 'api says hi')).toBe('api says hi');
    expect(enrollErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
