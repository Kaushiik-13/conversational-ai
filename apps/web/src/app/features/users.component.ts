import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import type { ApiResponse, Role, UserSummary } from '../core/models';
import { apiErrorMessage } from '../core/models';

interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  status: string;
  version: number;
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    status: string;
    version: number;
  }>;
}

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Administration</p>
        <h1>People & roles</h1>
        <p>Manage access for {{ auth.profile()?.activeContext?.organizationName }}.</p>
      </div>
      @if (canManage()) {
        <button
          class="button button--primary"
          type="button"
          (click)="showCreate.set(!showCreate())"
        >
          {{ showCreate() ? 'Close form' : 'Invite user' }}
        </button>
      }
    </header>

    @if (showCreate() && canManage()) {
      <form class="panel create-form" [formGroup]="createForm" (ngSubmit)="createUser()">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">New access</p>
            <h2>Invite a person</h2>
          </div>
          <p>
            Creates an invited account in the active organization. Credentials are activated through
            the secure account process.
          </p>
        </div>
        <div class="form-grid form-grid--three">
          <label>Display name<input formControlName="displayName" placeholder="Full name" /></label>
          <label
            >Email<input formControlName="email" type="email" placeholder="name@company.test"
          /></label>
          <label
            >Role
            <select formControlName="roleCode">
              @for (role of assignableRoles(); track role.code) {
                <option [value]="role.code">{{ role.name }}</option>
              }
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="button button--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Creating…' : 'Create invitation' }}
          </button>
        </div>
      </form>
    }

    @if (message()) {
      <div class="notice notice--success" role="status">{{ message() }}</div>
    }
    @if (error()) {
      <div class="notice notice--error" role="alert">
        <strong>People could not be updated</strong><span>{{ error() }}</span>
      </div>
    }

    <section class="panel table-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Active organization</p>
          <h2>Organization members</h2>
        </div>
        <span>{{ users().length }} loaded</span>
      </div>
      @if (loading()) {
        <div class="table-loading">Loading people…</div>
      } @else if (users().length === 0) {
        <div class="empty-inline">
          <strong>No people found</strong><span>This organization has no visible memberships.</span>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Status</th>
                <th>Role</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>
                    <strong>{{ user.displayName }}</strong
                    ><span>{{ user.email }}</span>
                  </td>
                  <td>
                    <span class="status-pill" [attr.data-status]="user.status">{{
                      user.status
                    }}</span>
                  </td>
                  <td>
                    @if (canManage()) {
                      <select
                        class="table-select"
                        [value]="user.role"
                        [disabled]="rowSaving() === user.id"
                        (change)="changeRole(user, $any($event.target).value)"
                      >
                        @for (role of assignableRoles(); track role.code) {
                          <option [value]="role.code">{{ role.name }}</option>
                        }
                      </select>
                    } @else {
                      {{ formatRole(user.role) }}
                    }
                  </td>
                  <td class="right">
                    @if (canManage()) {
                      @if (user.id !== auth.profile()?.user?.id) {
                        <button
                          class="text-button text-button--danger"
                          type="button"
                          [disabled]="rowSaving() === user.id"
                          (click)="toggleUser(user)"
                        >
                          {{ user.status === 'disabled' ? 'Enable' : 'Disable' }}
                        </button>
                      }
                    }
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
          Load more people
        </button>
      }
    </section>
  `,
})
export class UsersComponent {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  readonly users = signal<UserSummary[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly rowSaving = signal('');
  readonly showCreate = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly canManage = () =>
    this.auth.has('organization.users.manage') && this.auth.has('organization.roles.assign');
  readonly assignableRoles = () => this.roles().filter((role) => role.code !== 'GLOBAL_ADMIN');

  readonly createForm = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    roleCode: new FormControl('VIEWER', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    void Promise.all([this.load(false), this.loadRoles()]);
  }

  async load(append: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    let params = new HttpParams().set('limit', 50);
    if (append && this.nextCursor()) params = params.set('cursor', this.nextCursor()!);
    try {
      const response = await firstValueFrom(
        this.http.get<
          ApiResponse<
            UserSummary[],
            { requestId: string; nextCursor: string | null; limit: number }
          >
        >('/api/v1/users', { params }),
      );
      this.users.update((current) => (append ? [...current, ...response.data] : response.data));
      this.nextCursor.set(response.meta.nextCursor);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(): Promise<void> {
    if (this.createForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await firstValueFrom(
        this.http.post<ApiResponse<UserSummary>>('/api/v1/users', {
          ...this.createForm.getRawValue(),
          organizationId: this.auth.profile()?.activeContext?.organizationId,
        }),
      );
      this.message.set('The invitation was created.');
      this.createForm.reset({ displayName: '', email: '', roleCode: 'VIEWER' });
      this.showCreate.set(false);
      await this.load(false);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async changeRole(user: UserSummary, roleCode: string): Promise<void> {
    if (roleCode === user.role) {
      this.message.set('That role is already assigned.');
      return;
    }
    this.rowSaving.set(user.id);
    this.error.set('');
    try {
      const detail = await this.userDetail(user.id);
      const membership = detail.memberships.find((entry) => entry.id === user.membershipId);
      if (!membership) throw new Error('Membership not found');
      await firstValueFrom(
        this.http.patch(
          `/api/v1/memberships/${membership.id}`,
          { roleCode },
          {
            headers: { 'If-Match': `"${membership.version}"` },
          },
        ),
      );
      this.message.set(`${user.displayName}'s role was updated.`);
      await this.load(false);
    } catch (error) {
      this.error.set(
        apiErrorMessage(error, 'The role could not be updated. Reload and try again.'),
      );
    } finally {
      this.rowSaving.set('');
    }
  }

  async toggleUser(user: UserSummary): Promise<void> {
    this.rowSaving.set(user.id);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/v1/users/${user.id}`,
          { status: user.status === 'disabled' ? 'active' : 'disabled' },
          {
            headers: { 'If-Match': `"${user.version}"` },
          },
        ),
      );
      this.message.set(`${user.displayName}'s account was updated.`);
      await this.load(false);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.rowSaving.set('');
    }
  }

  formatRole(role: string): string {
    return role
      .toLowerCase()
      .split('_')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async loadRoles(): Promise<void> {
    if (!this.canManage()) return;
    try {
      const response = await firstValueFrom(this.http.get<ApiResponse<Role[]>>('/api/v1/roles'));
      this.roles.set(response.data);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Roles could not be loaded.'));
    }
  }

  private async userDetail(id: string): Promise<UserDetail> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<UserDetail>>(`/api/v1/users/${id}`),
    );
    return response.data;
  }
}
