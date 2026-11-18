import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, AuthProfile } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private restorePromise: Promise<boolean> | null = null;

  readonly profile = signal<AuthProfile | null>(null);
  readonly state = signal<'checking' | 'authenticated' | 'anonymous'>('checking');
  readonly authenticated = computed(() => this.state() === 'authenticated');

  async restore(): Promise<boolean> {
    if (this.state() === 'authenticated') return true;
    if (this.state() === 'anonymous') return false;
    if (!this.restorePromise) {
      this.restorePromise = firstValueFrom(
        this.http.get<ApiResponse<AuthProfile>>('/api/v1/auth/me'),
      )
        .then(({ data }) => {
          this.setProfile(data);
          return true;
        })
        .catch(() => {
          this.clear();
          return false;
        })
        .finally(() => (this.restorePromise = null));
    }
    return this.restorePromise;
  }

  async login(email: string, password: string): Promise<AuthProfile> {
    await firstValueFrom(this.http.get<ApiResponse<{ csrfToken: string }>>('/api/v1/auth/csrf'));
    const response = await firstValueFrom(
      this.http.post<ApiResponse<AuthProfile>>('/api/v1/auth/login', { email, password }),
    );
    this.setProfile(response.data);
    return response.data;
  }

  async selectOrganization(organizationId: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<AuthProfile>>('/api/v1/auth/organization-context', {
        organizationId,
      }),
    );
    this.setProfile(response.data);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/v1/auth/logout', {}));
    } finally {
      this.clear();
      await this.router.navigate(['/login']);
    }
  }

  has(capability: string): boolean {
    return this.profile()?.capabilities.includes(capability) ?? false;
  }

  sessionExpired(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 401;
  }

  clear(): void {
    this.profile.set(null);
    this.state.set('anonymous');
  }

  private setProfile(profile: AuthProfile): void {
    this.profile.set(profile);
    this.state.set('authenticated');
  }
}
