import { Department } from './department';

/** Sort options for the course list endpoint. */
export type CourseSortBy = 'code' | 'title' | 'relevance';

/**
 * Query parameters accepted by GET /api/courses.
 *
 * All fields are optional. When `search` is provided, the API defaults
 * `sortBy` to `'relevance'`; otherwise the default is `'code'`.
 */
export interface ListCoursesQuery {
  /** Defaults to the current open term on the server. */
  termId?: string;
  /** Filters courses by code prefix (e.g. `CS` matches `CS101`, `CS210`). */
  department?: Department | string;
  /** Full-text search query across code, title, and description. */
  search?: string;
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 20, capped at 100. */
  limit?: number;
  /** Sort order. Defaults to `'code'` or `'relevance'` when searching. */
  sortBy?: CourseSortBy;
}

/** Single row in the course list response. */
export interface CourseListItem {
  id: string;
  code: string;
  title: string;
  credits: number;
  /** Number of sections in the active term. */
  sectionCount: number;
  /** Sum of section capacities for the active term. */
  totalCapacity: number;
  /** Sum of section enrolledCount for the active term. */
  totalEnrolled: number;
}

/** Standard envelope for paginated list responses. */
export interface PaginatedCoursesResponse {
  data: CourseListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A single section as exposed by the catalog (read-only view). */
export interface Section {
  id: string;
  sectionNumber: string;
  instructorName: string;
  meetingPattern: string;
  room: string;
  capacity: number;
  enrolledCount: number;
  /** `capacity - enrolledCount`, never negative. */
  seatsAvailable: number;
}

/** Full course detail with sections for the active term. */
export interface CourseDetail {
  id: string;
  code: string;
  title: string;
  description: string | null;
  credits: number;
  sections: Section[];
}
