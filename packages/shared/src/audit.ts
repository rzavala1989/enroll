import { Role } from './enums';

export enum AuditAction {
  ENROLLMENT_CREATED = 'ENROLLMENT_CREATED',
  ENROLLMENT_DROPPED = 'ENROLLMENT_DROPPED',
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
