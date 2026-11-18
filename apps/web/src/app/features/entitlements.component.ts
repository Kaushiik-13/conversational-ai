import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import type {
  ApiResponse,
  CategoryNode,
  EntitlementEntry,
  EntitlementSet,
  Organization,
} from '../core/models';
import { apiErrorMessage } from '../core/models';

@Component({
  selector: 'app-entitlements',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Global administration</p>
        <h1>Organization access</h1>
        <p>Define which automotive category branches each organization can see.</p>
      </div>
    </header>

    <div class="admin-layout">
      <aside class="panel organization-list">
        <p class="eyebrow">Organizations</p>
        <h2>Select an organization</h2>
        @for (organization of organizations(); track organization.id) {
          <button
            type="button"
            [class.active]="selectedOrganization()?.id === organization.id"
            (click)="selectOrganization(organization)"
          >
            <span>{{ organization.code }}</span>
            <div>
              <strong>{{ organization.name }}</strong
              ><small>{{ organization.status }}</small>
            </div>
          </button>
        }
      </aside>

      <section class="panel entitlement-editor">
        @if (loading()) {
          <div class="table-loading">Loading organization access…</div>
        } @else if (selectedOrganization(); as organization) {
          <div class="panel-heading">
            <div>
              <p class="eyebrow">{{ organization.code }}</p>
              <h2>{{ organization.name }}</h2>
            </div>
            <span>Policy v{{ entitlementSet()?.version }}</span>
          </div>
          <div class="access-rule">
            <strong>Effective access</strong>
            <span
              >Organization rules are intersected with each user role and personal restrictions.
              Deny always wins.</span
            >
          </div>

          @if (draft().length === 0) {
            <div class="empty-inline">
              <strong>No active category rules</strong
              ><span>Add at least one allow rule before saving.</span>
            </div>
          } @else {
            <div class="rule-list">
              @for (entry of draft(); track entry.categoryId + ':' + entry.effect) {
                <div class="rule-row">
                  <span class="rule-effect" [attr.data-effect]="entry.effect">{{
                    entry.effect
                  }}</span>
                  <div>
                    <strong>{{ categoryName(entry.categoryId) }}</strong
                    ><small>{{
                      entry.includeDescendants
                        ? 'Includes all child categories'
                        : 'This category only'
                    }}</small>
                  </div>
                  <button
                    class="icon-button"
                    type="button"
                    (click)="removeRule(entry)"
                    aria-label="Remove rule"
                  >
                    ×
                  </button>
                </div>
              }
            </div>
          }

          @if (canUpdate()) {
            <form class="add-rule" [formGroup]="ruleForm" (ngSubmit)="addRule()">
              <label
                >Category
                <select formControlName="categoryId">
                  <option value="">Choose a category</option>
                  @for (category of categories(); track category.id) {
                    <option [value]="category.id">{{ category.indent }}{{ category.name }}</option>
                  }
                </select>
              </label>
              <label
                >Rule
                <select formControlName="effect">
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </label>
              <label class="checkbox"
                ><input type="checkbox" formControlName="includeDescendants" /> Include child
                categories</label
              >
              <button class="button button--outline" type="submit">Add rule</button>
            </form>
            <div class="save-bar">
              <span>Saving replaces this organization's current rule set.</span>
              <button
                class="button button--primary"
                type="button"
                [disabled]="saving() || !dirty()"
                (click)="save()"
              >
                {{ saving() ? 'Saving…' : 'Save access rules' }}
              </button>
            </div>
          }
        } @else {
          <div class="empty-inline">
            <strong>Choose an organization</strong
            ><span>Its active entitlement rules will appear here.</span>
          </div>
        }
        @if (message()) {
          <div class="notice notice--success" role="status">{{ message() }}</div>
        }
        @if (error()) {
          <div class="notice notice--error" role="alert">
            <strong>Access rules could not be loaded</strong><span>{{ error() }}</span>
          </div>
        }
      </section>
    </div>
  `,
})
export class EntitlementsComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly organizations = signal<Organization[]>([]);
  readonly selectedOrganization = signal<Organization | null>(null);
  readonly entitlementSet = signal<EntitlementSet | null>(null);
  readonly draft = signal<EntitlementEntry[]>([]);
  readonly categories = signal<Array<{ id: number; name: string; indent: string }>>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly canUpdate = () => this.auth.has('organization.entitlements.update');

  readonly ruleForm = new FormGroup({
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    effect: new FormControl<'allow' | 'deny'>('allow', { nonNullable: true }),
    includeDescendants: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    void this.initialize();
  }

  async selectOrganization(organization: Organization): Promise<void> {
    this.selectedOrganization.set(organization);
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<EntitlementSet>>(
          `/api/v1/organizations/${organization.id}/entitlements`,
        ),
      );
      this.entitlementSet.set(response.data);
      this.draft.set(response.data.entries.map((entry) => ({ ...entry })));
      this.dirty.set(false);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  addRule(): void {
    if (this.ruleForm.invalid) return;
    const value = this.ruleForm.getRawValue();
    const entry: EntitlementEntry = {
      categoryId: Number(value.categoryId),
      effect: value.effect,
      includeDescendants: value.includeDescendants,
    };
    if (
      this.draft().some(
        (current) => current.categoryId === entry.categoryId && current.effect === entry.effect,
      )
    ) {
      this.error.set('That rule is already in the draft.');
      return;
    }
    this.draft.update((current) => [...current, entry]);
    this.dirty.set(true);
    this.error.set('');
    this.ruleForm.reset({ categoryId: '', effect: 'allow', includeDescendants: true });
  }

  removeRule(entry: EntitlementEntry): void {
    this.draft.update((current) => current.filter((item) => item !== entry));
    this.dirty.set(true);
  }

  async save(): Promise<void> {
    const organization = this.selectedOrganization();
    const set = this.entitlementSet();
    if (!organization || !set || !this.dirty()) return;
    if (!window.confirm(`Replace the active category rules for ${organization.name}?`)) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.http.put<ApiResponse<EntitlementSet>>(
          `/api/v1/organizations/${organization.id}/entitlements`,
          {
            entitlements: this.draft().map(({ categoryId, effect, includeDescendants }) => ({
              categoryId,
              effect,
              includeDescendants,
            })),
          },
          { headers: { 'If-Match': `"${set.version}"` } },
        ),
      );
      this.entitlementSet.set(response.data);
      this.dirty.set(false);
      this.message.set(
        'Organization access rules were saved. Affected sessions will refresh their access.',
      );
    } catch (error) {
      this.error.set(
        apiErrorMessage(
          error,
          'The rules changed elsewhere or could not be saved. Reload and try again.',
        ),
      );
    } finally {
      this.saving.set(false);
    }
  }

  categoryName(id: number): string {
    return this.categories().find((category) => category.id === id)?.name ?? `Category ${id}`;
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    try {
      const [organizations, categories] = await Promise.all([
        firstValueFrom(this.http.get<ApiResponse<Organization[]>>('/api/v1/organizations')),
        firstValueFrom(this.http.get<ApiResponse<CategoryNode[]>>('/api/v1/categories/tree')),
      ]);
      this.organizations.set(organizations.data);
      this.categories.set(this.flatten(categories.data));
      if (organizations.data[0]) await this.selectOrganization(organizations.data[0]);
      else this.loading.set(false);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.loading.set(false);
    }
  }

  private flatten(nodes: CategoryNode[]): Array<{ id: number; name: string; indent: string }> {
    const result: Array<{ id: number; name: string; indent: string }> = [];
    const visit = (children: CategoryNode[]): void => {
      for (const node of children) {
        result.push({ id: node.id, name: node.name, indent: '— '.repeat(node.depth) });
        visit(node.children ?? []);
      }
    };
    visit(nodes);
    return result;
  }
}
