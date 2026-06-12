import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MatPaginatorModule,
  PageEvent,
} from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';

import {
  ALL_DEPARTMENTS,
  DEPARTMENT_LABELS,
  Department,
  type CourseListItem,
  type ListCoursesQuery,
  type PaginatedCoursesResponse,
} from '@enroll/shared';

import { CourseService } from '../services/course.service';

interface CatalogState {
  loading: boolean;
  error: string | null;
  response: PaginatedCoursesResponse | null;
}

const INITIAL_STATE: CatalogState = {
  loading: false,
  error: null,
  response: null,
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * The single source of truth for what the catalog is currently
 * displaying. Form controls and the paginator both push updates into
 * this shape via `intent$.next(...)`. One user action equals one
 * `.next` equals one HTTP request.
 *
 * `nonce` is a monotonically increasing integer that lets the retry
 * button trigger a new request even when nothing else changed: every
 * `.next` carries a distinct nonce, so the downstream `switchMap`
 * always fires.
 */
interface Intent {
  search: string;
  department: Department | null;
  page: number;
  limit: number;
  nonce: number;
}

@Component({
  selector: 'app-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <a mat-icon-button routerLink="/" aria-label="Back to home">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span class="title">Course Catalog</span>
    </mat-toolbar>

    <section class="filters">
      <mat-form-field appearance="outline" class="search">
        <mat-label>Search courses</mat-label>
        <input
          matInput
          placeholder="e.g. intro algorithms"
          [formControl]="searchControl"
          autocomplete="off"
        />
      </mat-form-field>

      <mat-form-field appearance="outline" class="department">
        <mat-label>Department</mat-label>
        <mat-select [formControl]="departmentControl">
          <mat-option [value]="null">All departments</mat-option>
          @for (d of departments; track d) {
            <mat-option [value]="d">{{ labelFor(d) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </section>

    @if (state$ | async; as state) {
      @if (state.loading) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (state.error) {
        <div class="message error">
          <p>{{ state.error }}</p>
          <button mat-stroked-button (click)="retry()">Retry</button>
        </div>
      } @else if (state.response && state.response.data.length === 0) {
        <div class="message empty">
          <p>No courses match your filters.</p>
          <button mat-stroked-button (click)="clearFilters()">
            Clear filters
          </button>
        </div>
      } @else if (state.response) {
        <div class="grid">
          @for (course of state.response.data; track course.id) {
            <mat-card appearance="outlined" class="course">
              <mat-card-header>
                <mat-card-title>{{ course.code }}</mat-card-title>
                <mat-card-subtitle>{{ course.title }}</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <p class="meta">
                  {{ course.credits }} credits ·
                  {{ course.sectionCount }} section{{
                    course.sectionCount === 1 ? '' : 's'
                  }}
                </p>
                <p class="seats">
                  {{ seatsAvailable(course) }} seats available across
                  {{ course.sectionCount }} section{{
                    course.sectionCount === 1 ? '' : 's'
                  }}
                </p>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <mat-paginator
          [length]="state.response.total"
          [pageSize]="state.response.limit"
          [pageIndex]="state.response.page - 1"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPage($event)"
          showFirstLastButtons
        />
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .title {
        margin-left: 0.5rem;
        font-weight: 400;
      }
      .filters {
        display: flex;
        gap: 1rem;
        padding: 1rem 1.5rem 0;
        flex-wrap: wrap;
      }
      .search {
        flex: 1 1 320px;
      }
      .department {
        flex: 0 0 240px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 1rem;
        padding: 1rem 1.5rem;
      }
      mat-card.course {
        transition: transform 120ms ease;
      }
      mat-card.course:hover {
        transform: translateY(-2px);
      }
      .meta {
        margin: 0.5rem 0 0.25rem;
        opacity: 0.8;
        font-size: 0.875rem;
      }
      .seats {
        margin: 0;
        font-size: 0.875rem;
      }
      .message {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 2rem;
      }
      .error p {
        color: var(--mat-sys-error, #b3261e);
      }
      mat-paginator {
        margin: 0 1.5rem 1.5rem;
      }
    `,
  ],
})
export class CatalogComponent implements OnInit {
  private readonly courseService = inject(CourseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly departments = ALL_DEPARTMENTS;

  readonly searchControl = new FormControl<string>('', { nonNullable: true });
  readonly departmentControl = new FormControl<Department | null>(null);

  /** Single source of truth for the current query. */
  private readonly intent$ = new BehaviorSubject<Intent>({
    search: '',
    department: null,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    nonce: 0,
  });

  state$!: Observable<CatalogState>;

  ngOnInit(): void {
    // Hydrate from URL query params so the page is shareable and
    // reload-safe.
    const snap = this.route.snapshot.queryParamMap;
    const initialSearch = snap.get('search') ?? '';
    const initialDept = snap.get('department') as Department | null;
    const initialPage = Number(snap.get('page') ?? '1') || 1;
    const initialLimit =
      Number(snap.get('limit') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;

    this.searchControl.setValue(initialSearch, { emitEvent: false });
    this.departmentControl.setValue(initialDept, { emitEvent: false });
    this.intent$.next({
      search: initialSearch,
      department: initialDept,
      page: initialPage,
      limit: initialLimit,
      nonce: 1,
    });

    // Search-as-you-type pipeline.
    //   • debounceTime(300):       wait 300ms of quiet before reacting,
    //                              so we don't fire a request per key.
    //   • distinctUntilChanged():  drop consecutive duplicates, e.g.
    //                              when the user retypes the same word.
    //   • switchMap (downstream on intent$): cancel any in-flight
    //                              request when a new intent arrives,
    //                              so stale responses can never
    //                              overwrite the current view.
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => this.pushIntent({ search, page: 1 }));

    this.departmentControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((department) =>
        this.pushIntent({ department: department ?? null, page: 1 }),
      );

    this.state$ = this.intent$.pipe(
      tap((intent) => this.syncUrl(intent)),
      switchMap((intent) => {
        const query: ListCoursesQuery = {
          page: intent.page,
          limit: intent.limit,
          ...(intent.search ? { search: intent.search } : {}),
          ...(intent.department ? { department: intent.department } : {}),
        };
        return this.courseService.listCourses(query).pipe(
          map(
            (response): CatalogState => ({
              loading: false,
              error: null,
              response,
            }),
          ),
          catchError((err): Observable<CatalogState> => {
            console.error('Course list request failed', err);
            return of<CatalogState>({
              loading: false,
              error:
                'We could not load the catalog. Check the API server, then try again.',
              response: null,
            });
          }),
          startWith<CatalogState>({
            loading: true,
            error: null,
            response: null,
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
      startWith(INITIAL_STATE),
    );
  }

  onPage(event: PageEvent): void {
    this.pushIntent({
      page: event.pageIndex + 1,
      limit: event.pageSize,
    });
  }

  retry(): void {
    // Re-fire with the current intent. The nonce bump on every
    // pushIntent makes BehaviorSubject re-emit even though everything
    // else is unchanged.
    this.pushIntent({});
  }

  clearFilters(): void {
    // Suppress the form-control valueChanges so they don't compete
    // with the explicit pushIntent call below.
    this.searchControl.setValue('', { emitEvent: false });
    this.departmentControl.setValue(null, { emitEvent: false });
    this.pushIntent({ search: '', department: null, page: 1 });
  }

  labelFor(d: Department): string {
    return DEPARTMENT_LABELS[d];
  }

  seatsAvailable(course: CourseListItem): number {
    return Math.max(0, course.totalCapacity - course.totalEnrolled);
  }

  /** Emit a new intent by patching the current one. Always bumps nonce. */
  private pushIntent(patch: Partial<Omit<Intent, 'nonce'>>): void {
    const cur = this.intent$.value;
    this.intent$.next({ ...cur, ...patch, nonce: cur.nonce + 1 });
  }

  /**
   * Mirror the current intent into the URL so the page is shareable
   * and survives reloads. `replaceUrl: true` keeps the back-stack
   * clean while typing.
   */
  private syncUrl(intent: Intent): void {
    const queryParams: Record<string, string | number | null> = {
      search: intent.search ? intent.search : null,
      department: intent.department ?? null,
      page: intent.page > 1 ? intent.page : null,
      limit: intent.limit !== DEFAULT_PAGE_SIZE ? intent.limit : null,
    };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
