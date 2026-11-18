import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiErrorMessage } from '../core/models';

interface NavItem {
  label: string;
  short: string;
  path: string;
  capability?: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-frame">
      <aside class="sidebar" [class.sidebar--open]="menuOpen()">
        <div class="sidebar-head">
          <a class="brand brand--light" routerLink="/search" (click)="menuOpen.set(false)">
            <span class="brand-mark">AS</span><span>Automotive Search</span>
          </a>
          <button
            class="icon-button sidebar-close"
            type="button"
            (click)="menuOpen.set(false)"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav aria-label="Main navigation">
          <p class="nav-label">Workspace</p>
          @for (item of visibleNavigation(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" (click)="menuOpen.set(false)">
              <span class="nav-icon">{{ item.short }}</span
              ><span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-foot">
          <p>{{ profile()?.user?.displayName }}</p>
          <span>{{ roleLabel() }}</span>
        </div>
      </aside>

      @if (menuOpen()) {
        <button
          class="sidebar-scrim"
          type="button"
          (click)="menuOpen.set(false)"
          aria-label="Close menu"
        ></button>
      }

      <div class="workspace">
        <header class="topbar">
          <button
            class="icon-button menu-button"
            type="button"
            (click)="menuOpen.set(true)"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div class="context-picker">
            <span>Viewing as</span>
            <select
              aria-label="Active organization"
              [value]="profile()?.activeContext?.organizationId ?? ''"
              [disabled]="switching()"
              (change)="switchOrganization($event)"
            >
              @for (membership of profile()?.memberships ?? []; track membership.membershipId) {
                <option [value]="membership.organizationId">
                  {{ membership.organizationName }} · {{ formatRole(membership.role) }}
                </option>
              }
            </select>
          </div>
          <div class="topbar-actions">
            <span class="scope-chip">{{ profile()?.activeContext?.organizationCode }}</span>
            <button
              class="button button--quiet"
              type="button"
              [disabled]="signingOut()"
              (click)="logout()"
            >
              {{ signingOut() ? 'Signing out…' : 'Sign out' }}
            </button>
          </div>
        </header>

        @if (shellError()) {
          <div class="global-message" role="alert">{{ shellError() }}</div>
        }
        <main class="page"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly profile = this.auth.profile;
  readonly menuOpen = signal(false);
  readonly switching = signal(false);
  readonly signingOut = signal(false);
  readonly shellError = signal('');

  private readonly navigation: NavItem[] = [
    { label: 'Ask AI', short: '✦', path: '/conversation', capability: 'catalog.read' },
    { label: 'Catalog search', short: '⌕', path: '/search', capability: 'catalog.search' },
    { label: 'People', short: 'P', path: '/users', capability: 'organization.users.read' },
    {
      label: 'Organization access',
      short: 'O',
      path: '/entitlements',
      capability: 'organization.entitlements.read',
    },
    { label: 'Taxonomy', short: 'T', path: '/taxonomy', capability: 'taxonomy.manage' },
    { label: 'Audit trail', short: 'A', path: '/audit', capability: 'audit.read' },
  ];

  readonly visibleNavigation = computed(() =>
    this.navigation.filter((item) => !item.capability || this.auth.has(item.capability)),
  );
  readonly roleLabel = computed(() => this.formatRole(this.profile()?.activeContext?.role ?? ''));

  async switchOrganization(event: Event): Promise<void> {
    const organizationId = (event.target as HTMLSelectElement).value;
    if (!organizationId || organizationId === this.profile()?.activeContext?.organizationId) return;
    this.switching.set(true);
    this.shellError.set('');
    try {
      await this.auth.selectOrganization(organizationId);
      await this.router.navigate(['/search']);
    } catch (error) {
      this.shellError.set(apiErrorMessage(error, 'The organization could not be selected.'));
    } finally {
      this.switching.set(false);
    }
  }

  async logout(): Promise<void> {
    this.signingOut.set(true);
    await this.auth.logout();
  }

  formatRole(role: string): string {
    return role
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
