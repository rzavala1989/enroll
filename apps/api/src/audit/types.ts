import type { AuditOutbox } from '@prisma/client';
import { AuditAction, AuditEvent, AuditTargetType } from '@enroll/shared';

export interface RecordEventParams {
  action: AuditAction;
  actor: {
    userId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  };
  target: {
    type: AuditTargetType;
    id: string;
  };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export function outboxRowToAuditEvent(row: AuditOutbox): AuditEvent {
  const payload = row.payload as {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  };

  return {
    occurredAt: row.createdAt.toISOString(),
    txCommittedAt: row.createdAt.toISOString(),
    actor: {
      userId: row.actorUserId,
      // Phase 2 will populate roles from a JWT-derived actor.
      // Until then the actor identity is request-body-asserted, not verified,
      // and roles are unknown.
      roles: [],
      ipAddress: row.actorIp,
      userAgent: row.actorUserAgent,
    },
    action: row.action as AuditAction,
    target: {
      type: row.targetType as AuditTargetType,
      id: row.targetId,
    },
    before: payload.before ?? null,
    after: payload.after ?? null,
    metadata: payload.metadata ?? {},
  };
}
