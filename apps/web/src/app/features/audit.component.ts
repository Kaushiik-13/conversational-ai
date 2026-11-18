import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, AuditEvent } from '../core/models';
import { apiErrorMessage } from '../core/models';

@Component({
  selector: 'app-audit',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Security visibility</p>
        <h1>Audit trail</h1>
        <p>Review allowed, denied, and failed activity within your permitted scope.</p>
      </div>
    </header>

    <form class="panel audit-filters" [formGroup]="form" (ngSubmit)="load(false)">
      <label>From<input type="date" formControlName="from" /></label>
      <label>To<input type="date" formControlName="to" /></label>
      <label
        >Decision<select formControlName="decision">
          <option value="">All decisions</option>
          <option value="allow">Allowed</option>
          <option value="deny">Denied</option>
          <option value="error">Error</option>
        </select></label
      >
      <label>Action<input formControlName="action" placeholder="For example, auth.login" /></label>
      <button class="button button--primary" type="submit" [disabled]="loading()">
        Apply filters
      </button>
    </form>

    @if (error()) {
      <div class="notice notice--error" role="alert">
        <strong>Audit events could not be loaded</strong><span>{{ error() }}</span>
      </div>
    }

    <section class="panel table-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Recent activity</p>
          <h2>{{ events().length }} events loaded</h2>
        </div>
        <span>Maximum 31-day range</span>
      </div>
      @if (loading() && events().length === 0) {
        <div class="table-loading">Loading audit activity…</div>
      } @else if (events().length === 0) {
        <div class="empty-inline">
          <strong>No events in this range</strong><span>Adjust the date or decision filters.</span>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Decision</th>
                <th>Action</th>
                <th>Target</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.id) {
                <tr>
                  <td>
                    <strong>{{ formatDate(event.occurredAt) }}</strong
                    ><span>{{ formatTime(event.occurredAt) }}</span>
                  </td>
                  <td>
                    <span class="decision-pill" [attr.data-decision]="event.decision">{{
                      event.decision
                    }}</span>
                  </td>
                  <td>
                    <code>{{ event.action }}</code>
                  </td>
                  <td>
                    <strong>{{ event.targetType || '—' }}</strong
                    ><span>{{ event.targetId || 'No target ID' }}</span>
                  </td>
                  <td>
                    <span class="mono" [title]="event.requestId">{{
                      shortId(event.requestId)
                    }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (nextCursor()) {
        <button
          class="button button--outline load-more"
          type="button"
          [disabled]="loading()"
          (click)="load(true)"
        >
          Load older events
        </button>
      }
    </section>
  `,
})
export class AuditComponent {
  private readonly http = inject(HttpClient);
  readonly events = signal<AuditEvent[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly form = new FormGroup({
    from: new FormControl(this.dateValue(-7), { nonNullable: true }),
    to: new FormControl(this.dateValue(1), { nonNullable: true }),
    decision: new FormControl('', { nonNullable: true }),
    action: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    void this.load(false);
  }

  async load(append: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    let params = new HttpParams()
      .set('limit', 50)
      .set('from', new Date(`${value.from}T00:00:00`).toISOString())
      .set('to', new Date(`${value.to}T23:59:59.999`).toISOString());
    if (value.decision) params = params.set('decision', value.decision);
    if (value.action.trim()) params = params.set('action', value.action.trim());
    if (append && this.nextCursor()) params = params.set('cursor', this.nextCursor()!);
    try {
      const response = await firstValueFrom(
        this.http.get<
          ApiResponse<AuditEvent[], { requestId: string; nextCursor: string | null; limit: number }>
        >('/api/v1/audit-events', { params }),
      );
      this.events.update((current) => (append ? [...current, ...response.data] : response.data));
      this.nextCursor.set(response.meta.nextCursor);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      if (!append) this.events.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
  }

  formatTime(value: string): string {
    return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(new Date(value));
  }

  shortId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}…` : value;
  }

  private dateValue(offsetDays: number): string {
    const value = new Date(Date.now() + offsetDays * 86_400_000);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
