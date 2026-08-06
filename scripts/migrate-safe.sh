#!/usr/bin/env bash
#
# Generate a Prisma migration with the generated-column drift stripped out.
#
# Course."searchVector" is a Postgres GENERATED ALWAYS AS ... STORED
# column (see 20260428070000_add_course_fts). Prisma cannot model
# generated columns, so it reads the column as drifted and emits two
# lines into every migration that touches Course:
#
#   DROP INDEX "Course_searchVector_idx";
#   ALTER TABLE "Course" ALTER COLUMN "searchVector" DROP DEFAULT;
#
# The DROP INDEX silently removes the GIN index that makes catalog
# search fast. The DROP DEFAULT fails outright, because Postgres wants
# DROP EXPRESSION for a generated column. The documented workaround was
# "run --create-only, delete those two lines by hand, then deploy",
# which is a manual step that a tired developer will eventually skip.
#
# Usage: pnpm db:migrate:safe <migration_name>

set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: pnpm db:migrate:safe <migration_name>" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/apps/api/prisma/migrations"

echo "==> Generating migration SQL (not applying it yet)"
pnpm --filter api exec prisma migrate dev --create-only --name "$NAME"

SQL_FILE="$(find "$MIGRATIONS_DIR" -name migration.sql -newer "$MIGRATIONS_DIR" -print 2>/dev/null | sort | tail -n 1)"
if [[ -z "$SQL_FILE" ]]; then
  SQL_FILE="$(ls -d "$MIGRATIONS_DIR"/*/ | sort | tail -n 1)migration.sql"
fi

echo "==> Scrubbing generated-column drift from $SQL_FILE"
BEFORE="$(wc -l < "$SQL_FILE")"
grep -v -E '^\s*(DROP INDEX "Course_searchVector_idx"|ALTER TABLE "Course" ALTER COLUMN "searchVector" DROP DEFAULT)' \
  "$SQL_FILE" > "$SQL_FILE.tmp"
mv "$SQL_FILE.tmp" "$SQL_FILE"
AFTER="$(wc -l < "$SQL_FILE")"
echo "    removed $((BEFORE - AFTER)) drift line(s)"

echo "==> Applying"
pnpm --filter api exec prisma migrate deploy

echo "==> Done. Review $SQL_FILE before committing."
