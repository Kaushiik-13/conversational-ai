import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import type { ApiResponse, CatalogRecord } from '../core/models';
import { apiErrorMessage } from '../core/models';

@Component({
  selector: 'app-part-detail',
  imports: [RouterLink],
  template: `
    <a class="back-link" routerLink="/search">← Back to results</a>

    @if (loading()) {
      <section class="detail-skeleton" aria-label="Loading part details">
        <div></div>
        <div></div>
        <div></div>
      </section>
    } @else if (denied()) {
      <section class="state-page state-page--inset">
        <span class="state-code">404</span>
        <p class="eyebrow">Part unavailable</p>
        <h1>This record is not in your visible catalog.</h1>
        <p>It may not exist, or your current organization and role may not include it.</p>
        <a class="button button--primary" routerLink="/search">Return to search</a>
      </section>
    } @else if (error()) {
      <div class="notice notice--error" role="alert">
        <strong>Part details could not be loaded</strong><span>{{ error() }}</span>
        <button class="text-button" type="button" (click)="load()">Try again</button>
      </div>
    } @else if (part(); as record) {
      <header class="detail-hero">
        <div>
          <div class="detail-kicker">
            <span class="status-pill">{{ record.lifecycleStatus }}</span>
            <span>{{ record.partNumber }}</span>
          </div>
          <h1>{{ record.partName }}</h1>
          <p>{{ record.description }}</p>
        </div>
        <div class="detail-identity">
          <span>ID {{ record.id }}</span>
          <strong>v{{ record.version }}</strong>
        </div>
      </header>

      <div class="detail-layout">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Specification</p>
              <h2>Part information</h2>
            </div>
          </div>
          <dl class="detail-grid">
            <div>
              <dt>Manufacturer</dt>
              <dd>{{ record.manufacturer }}</dd>
            </div>
            <div>
              <dt>Vehicle program</dt>
              <dd>{{ record.vehicleProgram }}</dd>
            </div>
            <div>
              <dt>Commodity</dt>
              <dd>{{ record.commodity }}</dd>
            </div>
            <div>
              <dt>Sub-commodity</dt>
              <dd>{{ record.subCommodity }}</dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{{ record.material }}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{{ record.weightKg }} kg</dd>
            </div>
            <div>
              <dt>Model year</dt>
              <dd>{{ record.modelYear }}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{{ record.country }}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{{ record.region }}</dd>
            </div>
            <div>
              <dt>Plant</dt>
              <dd>{{ record.plant }}</dd>
            </div>
          </dl>
        </section>

        <aside class="panel detail-side">
          <p class="eyebrow">Access-aware fields</p>
          <h2>Commercial & source</h2>
          @if (record.costUsd !== undefined) {
            <div class="metric">
              <span>Cost</span><strong>USD {{ record.costUsd }}</strong>
            </div>
          }
          @if (record.supplierStatus !== undefined) {
            <div class="metric">
              <span>Supplier status</span><strong>{{ record.supplierStatus }}</strong>
            </div>
          }
          @if (record.sourceSystem !== undefined) {
            <div class="metric">
              <span>Source</span><strong>{{ record.sourceSystem }}</strong>
            </div>
          }
          @if (
            record.costUsd === undefined &&
            record.supplierStatus === undefined &&
            record.sourceSystem === undefined
          ) {
            <div class="field-note">
              <strong>Protected fields hidden</strong>
              <p>Your role can view the part, but not its commercial or source details.</p>
            </div>
          }
          <div class="metric">
            <span>Record state</span><strong>{{ record.active ? 'Active' : 'Inactive' }}</strong>
          </div>
        </aside>
      </div>
    }
  `,
})
export class PartDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  readonly part = signal<CatalogRecord | null>(null);
  readonly loading = signal(true);
  readonly denied = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.denied.set(false);
    this.error.set('');
    const id = this.route.snapshot.paramMap.get('id');
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<CatalogRecord>>(`/api/v1/catalog/parts/${id}`),
      );
      this.part.set(response.data);
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 403 || error.status === 404)) {
        this.denied.set(true);
      } else {
        this.error.set(apiErrorMessage(error));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
