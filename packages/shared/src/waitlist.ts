/** Row in GET /api/sections/:id/waitlist (ADMIN/ADVISOR only). */
export interface WaitlistEntry {
  /** 1-based position in the waitlist (dense rank). */
  position: number;
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  /** When the student joined the waitlist (ISO 8601). */
  joinedAt: string;
}
