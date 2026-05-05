-- Phase 5 audit outbox.
--
-- Rows are written inside the same Postgres transaction as the business
-- mutation, then drained to Mongo by AuditOutboxWorker. The
-- (drainedAt, id) index supports the worker's "oldest undrained first"
-- scan with `WHERE drainedAt IS NULL ORDER BY id ASC`.
--
-- Note: prisma migrate dev attempted to also "fix" the searchVector
-- generated column on Course, which is an artifact of Prisma not fully
-- modeling Unsupported("tsvector") generated columns. Those spurious
-- statements have been removed by hand.

CREATE TABLE "AuditOutbox" (
    "id"             BIGSERIAL  NOT NULL,
    "action"         TEXT       NOT NULL,
    "actorUserId"    UUID,
    "actorIp"        TEXT,
    "actorUserAgent" TEXT,
    "targetType"     TEXT       NOT NULL,
    "targetId"       TEXT       NOT NULL,
    "payload"        JSONB      NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drainedAt"      TIMESTAMP(3),

    CONSTRAINT "AuditOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditOutbox_drainedAt_id_idx" ON "AuditOutbox"("drainedAt", "id");

-- Defensive: if the previous failed migration's DROP INDEX did somehow
-- commit (Postgres normally rolls back the whole transaction on error,
-- so this should be a no-op), restore the FTS index.
CREATE INDEX IF NOT EXISTS "Course_searchVector_idx" ON "Course" USING GIN ("searchVector");
