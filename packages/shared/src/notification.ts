export type NotificationType = 'WAITLIST_PROMOTED' | 'WAITLIST_EXPIRED';

/** Row in GET /api/notifications (always scoped to the current user). */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Linkage back to the triggering records, e.g. { enrollmentId, sectionId, courseId }. */
  payload?: Record<string, unknown>;
  /** ISO 8601, or null while unread. */
  readAt: string | null;
  /** ISO 8601. */
  createdAt: string;
}

export interface NotificationsResponse {
  /** Newest first. */
  data: NotificationItem[];
  /** Total unread rows for the user, independent of the page returned. */
  unreadCount: number;
}
