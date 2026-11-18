import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import type {
  ApiResponse,
  CategoryNode,
  FacetBucket,
  FacetName,
  SearchItem,
  SearchMeta,
  SearchRequest,
} from '../core/models';
import { apiErrorMessage } from '../core/models';

const FACETS: FacetName[] = [
  'securityDomain',
  'primaryCategory',
  'manufacturer',
  'region',
  'material',
  'lifecycleStatus',
];

@Component({
  selector: 'app-search',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="page-header page-header--search">
      <div>
        <p class="eyebrow">ParadeDB catalog</p>
        <h1>Find the right part</h1>
        <p>Every result and count is already limited to your active organization and role.</p>
      </div>
      <span class="dataset-badge"><strong>5,000,000</strong> indexed records</span>
    </header>

    <form class="search-bar" [formGroup]="form" (ngSubmit)="search(false)">
      <span class="search-glyph" aria-hidden="true">⌕</span>
      <input
        formControlName="query"
        type="search"
        placeholder="Try brake pad, steering rack, tyre…"
        aria-label="Search catalog"
      />
      <button class="button button--accent" type="submit" [disabled]="loading()">
        {{ loading() ? 'Searching…' : 'Search' }}
      </button>
    </form>

    <details class="filter-drawer" [open]="filtersOpen()">
      <summary (click)="filtersOpen.set(!filtersOpen())">
        <span>Filters</span><small>{{ activeFilterCount() }} active</small>
      </summary>
      <div class="filter-grid" [formGroup]="form">
        <label>
          Automotive domain
          <select formControlName="domainId">
            <option value="">All visible domains</option>
            @for (domain of domains(); track domain.id) {
              <option [value]="domain.id">
                {{ facetOptionLabel('securityDomain', domain.id, domain.name) }}
              </option>
            }
          </select>
        </label>
        <label>
          Category
          <select formControlName="categoryId">
            <option value="">All visible categories</option>
            @for (category of categories(); track category.id) {
              <option [value]="category.id">
                {{
                  category.indent + facetOptionLabel('primaryCategory', category.id, category.name)
                }}
              </option>
            }
          </select>
        </label>
        <label>
          Manufacturer
          <input formControlName="manufacturer" placeholder="Exact manufacturer" />
        </label>
        <label>
          Region
          <input formControlName="region" placeholder="For example, Europe" />
        </label>
        <label>
          Material
          <input formControlName="material" placeholder="For example, Ceramic" />
        </label>
        <label>
          Lifecycle
          <select formControlName="lifecycleStatus">
            <option value="">All states</option>
            <option value="active">Active</option>
            <option value="prototype">Prototype</option>
            <option value="superseded">Superseded</option>
            <option value="obsolete">Obsolete</option>
            <option value="end-of-life">End of life</option>
          </select>
        </label>
        <label>
          Model year from
          <input formControlName="yearFrom" type="number" min="1886" max="2100" />
        </label>
        <label>
          Model year to
          <input formControlName="yearTo" type="number" min="1886" max="2100" />
        </label>
        <label>
          Sort by
          <select formControlName="sortField">
            <option value="relevance">Best match</option>
            <option value="partNumber">Part number</option>
            <option value="modelYear">Model year</option>
            <option value="updatedAt">Recently updated</option>
          </select>
        </label>
        <label>
          Direction
          <select formControlName="sortDirection">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <div class="filter-actions">
          <button class="button button--quiet" type="button" (click)="clearFilters()">
            Clear filters
          </button>
          <button class="button button--primary" type="button" (click)="search(false)">
            Apply filters
          </button>
        </div>
      </div>
    </details>

    @if (error()) {
      <div class="notice notice--error" role="alert">
        <strong>Search could not be completed</strong>
        <span>{{ error() }}</span>
        <button class="text-button" type="button" (click)="search(false)">Try again</button>
      </div>
    }

    @if (!hasSearched() && !error()) {
      <section class="search-welcome">
        <div class="welcome-visual"><span>⌕</span></div>
        <div>
          <p class="eyebrow">Ready when you are</p>
          <h2>Search across your authorized catalog</h2>
          <p>
            Use a part name, number, material, manufacturer, or automotive term. Filters and facet
            counts never include records outside your access.
          </p>
        </div>
      </section>
    }

    @if (hasSearched() && !loading() && items().length === 0 && !error()) {
      <section class="empty-state">
        <span>0</span>
        <h2>No visible parts matched</h2>
        <p>
          Try a broader term or clear one of the filters. Hidden records are never counted here.
        </p>
        @if (queryTimeMs() !== null) {
          <small class="empty-timing">
            Query completed in {{ formatMilliseconds(queryTimeMs()!) }} ms
          </small>
        }
        <button class="button button--primary" type="button" (click)="clearAndFocus()">
          Start a new search
        </button>
      </section>
    }

    @if (items().length > 0 || loading()) {
      <div class="results-layout" [class.results-layout--wide]="!hasFacetData()">
        @if (hasFacetData()) {
          <aside class="facets" aria-label="Refine results">
            <div class="facets-head">
              <h2>Refine</h2>
              <span>6 scoped groups</span>
            </div>
            @for (facet of facetSections; track facet.key) {
              <section>
                <div class="facet-title">
                  <h3>{{ facet.label }}</h3>
                  <small>{{ (facetData()[facet.key] ?? []).length }} values</small>
                </div>
                @if ((facetData()[facet.key] ?? []).length > 0) {
                  @for (bucket of facetData()[facet.key] ?? []; track bucket.value) {
                    <button type="button" (click)="applyFacet(facet.key, bucket)">
                      <span>{{ facetValueLabel(facet.key, bucket) }}</span>
                      <strong>{{ formatCount(bucket.count) }}</strong>
                    </button>
                  }
                } @else {
                  <p class="facet-empty">No visible values</p>
                }
              </section>
            }
          </aside>
        }

        <section class="results" aria-live="polite">
          <div class="results-head">
            <div>
              <p class="eyebrow">Search results</p>
              <h2>{{ formatCount(total()) }} visible matches</h2>
            </div>
            <div class="query-stats">
              @if (queryTimeMs() !== null) {
                <span
                  ><strong>{{ formatMilliseconds(queryTimeMs()!) }} ms</strong> query time</span
                >
              }
              <span>{{ items().length }} loaded</span>
            </div>
          </div>

          @if (loading() && items().length === 0) {
            <div class="result-skeletons" aria-label="Loading search results">
              @for (row of [1, 2, 3, 4]; track row) {
                <div class="skeleton-card"></div>
              }
            </div>
          }

          <div class="result-list">
            @for (item of items(); track item.id) {
              <article class="result-card">
                <div class="result-card__top">
                  <span class="status-pill">{{ item.lifecycleStatus }}</span>
                  <span>{{ item.partNumber }}</span>
                </div>
                <h3>
                  <a [routerLink]="['/parts', item.id]">{{ item.partName }}</a>
                </h3>
                <p>{{ item.description }}</p>
                <dl>
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{{ item.manufacturer }}</dd>
                  </div>
                  <div>
                    <dt>Vehicle</dt>
                    <dd>{{ item.vehicleProgram }}</dd>
                  </div>
                  <div>
                    <dt>Year</dt>
                    <dd>{{ item.modelYear }}</dd>
                  </div>
                  <div>
                    <dt>Region</dt>
                    <dd>{{ item.region }}</dd>
                  </div>
                  <div>
                    <dt>Material</dt>
                    <dd>{{ item.material }}</dd>
                  </div>
                  <div>
                    <dt>Weight</dt>
                    <dd>{{ item.weightKg }} kg</dd>
                  </div>
                </dl>
                <a class="result-link" [routerLink]="['/parts', item.id]"
                  >View part details <span>→</span></a
                >
              </article>
            }
          </div>

          @if (nextCursor()) {
            <button
              class="button button--outline load-more"
              type="button"
              [disabled]="loading()"
              (click)="search(true)"
            >
              {{ loading() ? 'Loading…' : 'Load more results' }}
            </button>
          }
        </section>
      </div>
    }
  `,
})
export class SearchComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasSearched = signal(false);
  readonly filtersOpen = signal(false);
  readonly items = signal<SearchItem[]>([]);
  readonly total = signal(0);
  readonly queryTimeMs = signal<number | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly facetData = signal<Partial<Record<FacetName, FacetBucket[]>>>({});
  readonly categories = signal<Array<{ id: number; name: string; indent: string }>>([]);
  readonly domains = signal<Array<{ id: number; name: string }>>([]);

  readonly facetSections: Array<{ key: FacetName; label: string }> = [
    { key: 'securityDomain', label: 'Automotive domain' },
    { key: 'primaryCategory', label: 'Category' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'region', label: 'Region' },
    { key: 'material', label: 'Material' },
    { key: 'lifecycleStatus', label: 'Lifecycle' },
  ];

  readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    domainId: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    manufacturer: new FormControl('', { nonNullable: true }),
    region: new FormControl('', { nonNullable: true }),
    material: new FormControl('', { nonNullable: true }),
    lifecycleStatus: new FormControl('', { nonNullable: true }),
    yearFrom: new FormControl<number | null>(null),
    yearTo: new FormControl<number | null>(null),
    sortField: new FormControl<SearchRequest['sort']['field']>('relevance', { nonNullable: true }),
    sortDirection: new FormControl<SearchRequest['sort']['direction']>('desc', {
      nonNullable: true,
    }),
  });

  constructor() {
    void this.loadCategories();
    if (this.auth.profile()?.activeContext?.role === 'GLOBAL_ADMIN') {
      this.form.controls.sortField.setValue('updatedAt');
      this.form.controls.sortDirection.setValue('desc');
      void this.search(false, true, false);
    }
  }

  activeFilterCount(): number {
    const value = this.form.getRawValue();
    return [
      value.domainId,
      value.categoryId,
      value.manufacturer,
      value.region,
      value.material,
      value.lifecycleStatus,
      value.yearFrom,
      value.yearTo,
    ].filter((entry) => entry !== '' && entry !== null).length;
  }

  async search(append: boolean, allowEmptyQuery = false, includeFacets = true): Promise<void> {
    const canBrowseWithoutQuery =
      allowEmptyQuery || this.auth.profile()?.activeContext?.role === 'GLOBAL_ADMIN';
    if ((!canBrowseWithoutQuery && !this.form.controls.query.value.trim()) || this.loading()) {
      return;
    }
    this.loading.set(true);
    if (!append) this.hasSearched.set(true);
    this.error.set('');
    const request = this.buildRequest(
      append ? (this.nextCursor() ?? undefined) : undefined,
      includeFacets,
    );
    try {
      const response = await firstValueFrom(
        this.http.post<
          ApiResponse<
            { items: SearchItem[]; facets: Partial<Record<FacetName, FacetBucket[]>> },
            SearchMeta
          >
        >('/api/v1/search', request),
      );
      this.items.update((current) =>
        append ? [...current, ...response.data.items] : response.data.items,
      );
      this.facetData.set(response.data.facets);
      this.total.set(response.meta.visibleHitCount);
      this.queryTimeMs.set(response.meta.queryTimeMs);
      this.nextCursor.set(response.meta.nextCursor);
      this.hasSearched.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Review the search term and filters, then try again.'));
      if (!append) this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  applyFacet(facet: FacetName, bucket: FacetBucket): void {
    if (facet === 'securityDomain') {
      this.form.controls.domainId.setValue(bucket.value);
    } else if (facet === 'primaryCategory') {
      this.form.controls.categoryId.setValue(bucket.value);
    } else if (facet === 'manufacturer') {
      this.form.controls.manufacturer.setValue(bucket.value);
    } else if (facet === 'region') {
      this.form.controls.region.setValue(bucket.value);
    } else if (facet === 'material') {
      this.form.controls.material.setValue(bucket.value);
    } else if (facet === 'lifecycleStatus') {
      this.form.controls.lifecycleStatus.setValue(bucket.value);
    }
    this.filtersOpen.set(true);
    void this.search(false);
  }

  clearFilters(): void {
    const query = this.form.controls.query.value;
    this.form.reset({
      query,
      domainId: '',
      categoryId: '',
      manufacturer: '',
      region: '',
      material: '',
      lifecycleStatus: '',
      yearFrom: null,
      yearTo: null,
      sortField: 'relevance',
      sortDirection: 'desc',
    });
  }

  clearAndFocus(): void {
    this.form.reset({
      query: '',
      domainId: '',
      categoryId: '',
      manufacturer: '',
      region: '',
      material: '',
      lifecycleStatus: '',
      yearFrom: null,
      yearTo: null,
      sortField: 'relevance',
      sortDirection: 'desc',
    });
    this.hasSearched.set(false);
    this.items.set([]);
    this.queryTimeMs.set(null);
  }

  formatCount(value: number): string {
    return new Intl.NumberFormat('en-IN').format(value);
  }

  formatMilliseconds(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  facetValueLabel(facet: FacetName, bucket: FacetBucket): string {
    if (bucket.label) return bucket.label;
    if (facet === 'securityDomain') {
      return (
        this.domains().find((domain) => domain.id === Number(bucket.value))?.name ?? bucket.value
      );
    }
    if (facet === 'primaryCategory') {
      return (
        this.categories().find((category) => category.id === Number(bucket.value))?.name ??
        bucket.value
      );
    }
    return bucket.value;
  }

  facetOptionLabel(facet: FacetName, value: number | string, label: string): string {
    if (!this.hasSearched()) return label;
    const buckets = this.facetData()[facet];
    if (!buckets) return label;
    const count = buckets.find((bucket) => String(bucket.value) === String(value))?.count;
    return `${label} (${this.formatCount(count ?? 0)})`;
  }

  hasFacetData(): boolean {
    return Object.keys(this.facetData()).length > 0;
  }

  private buildRequest(cursor?: string, includeFacets = true): SearchRequest {
    const value = this.form.getRawValue();
    const filters: NonNullable<SearchRequest['filters']> = {};
    if (value.domainId) filters.securityDomainIds = [Number(value.domainId)];
    if (value.categoryId) filters.primaryCategoryIds = [Number(value.categoryId)];
    if (value.manufacturer.trim()) filters.manufacturerNames = [value.manufacturer.trim()];
    if (value.region.trim()) filters.regions = [value.region.trim()];
    if (value.material.trim()) filters.materials = [value.material.trim()];
    if (value.lifecycleStatus) filters.lifecycleStatuses = [value.lifecycleStatus];
    if (value.yearFrom !== null || value.yearTo !== null) {
      filters.modelYears = {
        ...(value.yearFrom !== null ? { from: value.yearFrom } : {}),
        ...(value.yearTo !== null ? { to: value.yearTo } : {}),
      };
    }
    return {
      query: value.query.trim(),
      ...(Object.keys(filters).length ? { filters } : {}),
      facets: includeFacets ? FACETS : [],
      sort: { field: value.sortField, direction: value.sortDirection },
      limit: 25,
      ...(cursor ? { cursor } : {}),
    };
  }

  private async loadCategories(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<CategoryNode[]>>('/api/v1/categories/tree'),
      );
      const flattened: Array<{ id: number; name: string; indent: string }> = [];
      const domains: Array<{ id: number; name: string }> = [];
      const visit = (nodes: CategoryNode[]): void => {
        for (const node of nodes) {
          flattened.push({
            id: node.id,
            name: node.name,
            indent: node.depth ? '— '.repeat(node.depth) : '',
          });
          if (node.isSecurityDomain) domains.push({ id: node.id, name: node.name });
          visit(node.children ?? []);
        }
      };
      visit(response.data);
      this.categories.set(flattened);
      this.domains.set(domains);
    } catch {
      // Search remains usable when the optional category picker is unavailable.
    }
  }
}
