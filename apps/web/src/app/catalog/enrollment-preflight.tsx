import { useState } from 'react';
import type {
  CourseListItem,
  Section,
  MyEnrollment,
  Hold,
  CourseDetail,
} from '@enroll/shared';
import { EnrollmentStatus } from '@enroll/shared';
import { hasTimeConflict } from '@/lib/time-conflict';

export function EnrollmentPreflight({
  course,
  section,
  enrolledCredits,
  enrollments,
  holds,
  detail,
  onClose,
}: {
  course: CourseListItem;
  section: Section;
  enrolledCredits: number;
  enrollments: MyEnrollment[];
  holds: Hold[];
  detail: CourseDetail;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const activeSchedules = enrollments
    .filter(
      (e) =>
        e.status === EnrollmentStatus.ENROLLED ||
        e.status === EnrollmentStatus.WAITLISTED,
    )
    .map((e) => e.section.meetingPattern);

  const completedCodes = new Set(
    enrollments
      .filter((e) => e.status === EnrollmentStatus.COMPLETED)
      .map((e) => e.course.code),
  );

  const isTimeConflict = activeSchedules.some((active) =>
    hasTimeConflict(section.meetingPattern, active),
  );
  const isPrereqMissing =
    detail.prerequisites.length > 0 &&
    !detail.prerequisites.every((p) => completedCodes.has(p.code));
  const creditCapRisk = enrolledCredits + course.credits > 18;
  const isFull = section.capacity - section.enrolledCount <= 0;
  const hasHold = holds.length > 0;
  const waitlistFull =
    section.waitlistCap !== null && section.waitlistCount >= section.waitlistCap;

  const canEnroll =
    !isTimeConflict && !isPrereqMissing && !creditCapRisk && !isFull && !hasHold;
  const canWaitlist =
    !isTimeConflict &&
    !isPrereqMissing &&
    !creditCapRisk &&
    isFull &&
    !waitlistFull &&
    !hasHold;

  const handleAction = async () => {
    setSubmitting(true);
    // In a real app, this would trigger the actual enrollment mutation.
    // We simulate a network delay here to show off the loading state.
    setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 800);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border border-line bg-card p-6 shadow-xl">
        <h2 className="mb-1 font-display text-xl font-bold text-ink">
          {canEnroll ? 'Enrollment preflight' : 'Cannot enroll'}
        </h2>
        <p className="mb-6 text-sm text-ink-soft">
          {course.code} &middot; Section {section.sectionNumber}
        </p>

        <ul className="mb-8 space-y-3 text-sm text-ink">
          <li className="flex items-center gap-3">
            <span className="text-pine">✓</span>
            <span>Registration window open</span>
          </li>
          <li className="flex items-center gap-3">
            {hasHold ? (
              <span className="text-full">✕ Advisor hold on record</span>
            ) : (
              <>
                <span className="text-pine">✓</span>
                <span>No advisor hold</span>
              </>
            )}
          </li>
          <li className="flex items-center gap-3">
            {isPrereqMissing ? (
              <span className="text-full">✕ Prerequisites missing</span>
            ) : (
              <>
                <span className="text-pine">✓</span>
                <span>Prerequisites satisfied</span>
              </>
            )}
          </li>
          <li className="flex items-center gap-3">
            {isTimeConflict ? (
              <span className="text-full">✕ Time conflict with existing schedule</span>
            ) : (
              <>
                <span className="text-pine">✓</span>
                <span>No time conflict</span>
              </>
            )}
          </li>
          <li className="flex items-center gap-3">
            {creditCapRisk ? (
              <span className="text-amber">
                ✕ Exceeds credit cap: {enrolledCredits + course.credits} / 18
              </span>
            ) : (
              <>
                <span className="text-pine">✓</span>
                <span>Credit cap OK: {enrolledCredits + course.credits} / 18</span>
              </>
            )}
          </li>
          <li className="flex items-center gap-3">
            {isFull ? (
              waitlistFull ? (
                <span className="text-full">✕ Section and waitlist are full</span>
              ) : (
                <span className="text-wait">! Section is full, waitlist available</span>
              )
            ) : (
              <>
                <span className="text-pine">✓</span>
                <span>Seat available</span>
              </>
            )}
          </li>
        </ul>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-sm px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink"
            disabled={submitting}
          >
            Cancel
          </button>
          {(canEnroll || canWaitlist) && (
            <button
              onClick={handleAction}
              disabled={submitting}
              className="rounded-sm bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-pine-dark disabled:opacity-50"
            >
              {submitting
                ? 'Processing...'
                : canEnroll
                  ? 'Confirm enrollment'
                  : 'Join waitlist'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
