import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  CourseDetail,
  ListCoursesQuery,
  PaginatedCoursesResponse,
} from '@enroll/shared';

/**
 * Thin HttpClient wrapper for the course catalog endpoints. The dev
 * proxy in proxy.conf.json forwards `/api/*` to the NestJS API at
 * localhost:3000, so requests go to relative URLs and stay on the
 * same origin in production builds.
 */
@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/courses';

  /** GET /api/courses with all optional filters as query params. */
  listCourses(
    query: ListCoursesQuery,
  ): Observable<PaginatedCoursesResponse> {
    let params = new HttpParams();
    if (query.termId) params = params.set('termId', query.termId);
    if (query.department) params = params.set('department', query.department);
    if (query.search) params = params.set('search', query.search);
    if (query.page != null) params = params.set('page', query.page);
    if (query.limit != null) params = params.set('limit', query.limit);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);

    return this.http.get<PaginatedCoursesResponse>(this.baseUrl, { params });
  }

  /** GET /api/courses/:id */
  getCourse(id: string): Observable<CourseDetail> {
    return this.http.get<CourseDetail>(`${this.baseUrl}/${id}`);
  }
}