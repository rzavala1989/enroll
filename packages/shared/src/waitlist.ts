/** Body for PATCH /api/sections/:id/waitlist (ADMIN only). */
export interface ReorderWaitlistRequest {
  /**
   * Every WAITLISTED enrollment id for the section, in the desired
   * order. Must match the current waitlist set exactly; a stale list
   * is rejected with 409 WAITLIST_CHANGED.
   */
  orderedEnrollmentIds: string[];
}

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
