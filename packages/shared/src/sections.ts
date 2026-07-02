/** Body for PATCH /api/sections/:id (ADMIN only). At least one field required. */
export interface UpdateSectionRequest {
  /** New seat capacity; must be >= the current enrolledCount. */
  capacity?: number;
  /** New waitlist cap; null = unlimited, 0 = waitlist disabled. */
  waitlistCap?: number | null;
}

/** Response of GET and PATCH /api/sections/:id (ADMIN/ADVISOR view). */
export interface SectionSummary {
  id: string;
  sectionNumber: string;
  courseId: string;
  courseCode: string;
  capacity: number;
  enrolledCount: number;
  /** `capacity - enrolledCount`, never negative. */
  seatsAvailable: number;
  /** Students currently WAITLISTED for this section. */
  waitlistCount: number;
  /** Max waitlist size; null = unlimited, 0 = waitlist disabled. */
  waitlistCap: number | null;
}
