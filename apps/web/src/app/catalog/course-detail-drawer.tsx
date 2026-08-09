import type { CourseListItem, CourseDetail, Section } from '@enroll/shared';
import { useState } from 'react';
import { EnrollmentPreflight } from './enrollment-preflight';

export function CourseDetailDrawer({
  listItem,
  detail,
  enrolledCredits,
}: {
  listItem: CourseListItem;
  detail: CourseDetail | null;
  enrolledCredits: number;
}) {
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  const isCore = listItem.code.includes('1');
  const requirementLabel = isCore ? 'Major core' : 'Major elective';

  // Mock domain logic for portfolio presentation
  const isTimeConflict = listItem.code === 'CS110';
  const isPrereqMissing = listItem.code === 'CS141';
  const creditCapRisk = enrolledCredits + listItem.credits > 18;

  return (
    <>
      <div className="rounded-sm border border-line bg-card p-5 shadow-sm">
        <h3 className="mb-1 font-display text-lg font-bold text-ink">
          {listItem.code} {listItem.title}
        </h3>
        <p className="mb-6 text-sm text-ink-soft">
          {listItem.credits} credits &middot; {requirementLabel}
        </p>

        <div className="mb-6">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Eligibility
          </h4>
          <ul className="space-y-2 text-sm text-ink">
            <li className="flex items-center gap-2">
              {isPrereqMissing ? (
                <span className="text-amber">✕ Prerequisite missing</span>
              ) : (
                <span className="text-pine">✓ Prerequisites met</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              {isTimeConflict ? (
                <span className="text-full">✕ Time conflict</span>
              ) : (
                <span className="text-pine">✓ No time conflict</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              {creditCapRisk ? (
                <span className="text-amber">✕ Credit cap exceeded</span>
              ) : (
                <span className="text-pine">✓ Within credit cap</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-pine">✓ Registration window open</span>
            </li>
          </ul>
        </div>

        <div className="mb-6">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Sections
          </h4>
          {!detail ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 rounded-sm bg-line/50" />
              <div className="h-10 rounded-sm bg-line/50" />
            </div>
          ) : (
            <div className="space-y-2">
              {detail.sections.map((sec) => (
                <div
                  key={sec.id}
                  className="flex items-center justify-between rounded-sm border border-line p-3"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold text-ink">
                      {sec.sectionNumber}
                    </div>
                    <div className="text-xs text-ink-soft">
                      {sec.meetingPattern || 'Online'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-medium text-ink">
                        {Math.max(0, sec.capacity - sec.enrolledCount)} / {sec.capacity}{' '}
                        seats
                      </div>
                      {sec.waitlistCount > 0 && (
                        <div className="text-[10px] text-wait">
                          {sec.waitlistCount} on waitlist
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedSection(sec)}
                      className="rounded-sm bg-pine px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-pine-dark"
                    >
                      {sec.capacity - sec.enrolledCount > 0 ? 'Enroll' : 'Waitlist'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Impact
          </h4>
          <div className="space-y-2 text-sm text-ink">
            <p>
              Credits after enroll:{' '}
              <span className="font-mono font-medium">
                {enrolledCredits + listItem.credits} / 18
              </span>
            </p>
            <p>Counts toward {requirementLabel}</p>
          </div>
        </div>
      </div>

      {selectedSection && (
        <EnrollmentPreflight
          course={listItem}
          section={selectedSection}
          enrolledCredits={enrolledCredits}
          onClose={() => setSelectedSection(null)}
        />
      )}
    </>
  );
}
