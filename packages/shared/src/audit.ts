import { Role } from './enums';

export enum AuditAction {
  ENROLLMENT_CREATED = 'ENROLLMENT_CREATED',
  ENROLLMENT_DROPPED = 'ENROLLMENT_DROPPED',
  ENROLLMENT_WAITLISTED = 'ENROLLMENT_WAITLISTED',
  ENROLLMENT_WAITLIST_LEFT = 'ENROLLMENT_WAITLIST_LEFT',
  ENROLLMENT_PROMOTED = 'ENROLLMENT_PROMOTED',
  /** Waitlist row expired because its term's registration closed. */
  ENROLLMENT_WAITLIST_EXPIRED = 'ENROLLMENT_WAITLIST_EXPIRED',
  /** Admin changed section capacity or waitlist cap. */
  SECTION_UPDATED = 'SECTION_UPDATED',
  /** Admin manually reordered a section's waitlist. */
  WAITLIST_REORDERED = 'WAITLIST_REORDERED',
  ENROLLMENT_SWAPPED = 'ENROLLMENT_SWAPPED',
}

export type AuditTargetType = 'enrollment' | 'section' | 'course' | 'user' | 'auth';

export interface AuditActor {
  userId: string | null;
  roles: Role[];
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditTarget {
  type: AuditTargetType;
  id: string;
}

export interface AuditEvent {
  occurredAt: string;
  txCommittedAt: string;
  actor: AuditActor;
  action: AuditAction;
  target: AuditTarget;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}
