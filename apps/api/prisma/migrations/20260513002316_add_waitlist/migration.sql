-- NOTE: future `prisma migrate dev` runs that diff the Course model may emit
-- bogus Course full-text-search changes. Those lines remove the generated-column
-- search index or try to alter the generated expression in a way Postgres rejects.
-- Also, the partial unique index "enrollment_one_active_per_student_section"
-- added below is not tracked by Prisma, so it can appear as schema drift on future diffs.
-- Workflow for future migrations: run `migrate dev --create-only`, remove any bogus
-- Course FTS edits and any re-creation of the partial unique index, then `migrate deploy`.

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "waitlistPosition" INTEGER;

-- CreateIndex
CREATE INDEX "Enrollment_sectionId_waitlistPosition_idx" ON "Enrollment"("sectionId", "waitlistPosition");

-- A student can hold at most one ENROLLED or WAITLISTED row per section.
CREATE UNIQUE INDEX "enrollment_one_active_per_student_section"
  ON "Enrollment" ("studentId", "sectionId")
  WHERE status IN ('ENROLLED', 'WAITLISTED');
