-- Course full-text search.
--
-- Adds a generated tsvector column on Course composed from code (A),
-- title (B), and description (C), and a GIN index over it. Postgres
-- maintains the column automatically on every insert/update, so the
-- application never writes to it directly. Read-side queries hit it
-- via $queryRaw with to_tsquery + ts_rank for relevance sorting.

ALTER TABLE "Course"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("code", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("title", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;

CREATE INDEX "Course_searchVector_idx" ON "Course" USING GIN ("searchVector");