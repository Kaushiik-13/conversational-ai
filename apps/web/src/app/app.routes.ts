import { Routes } from '@angular/router';
import { anonymousGuard, authGuard, capabilityGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [anonymousGuard],
    loadComponent: () =>
      import('./features/login.component').then((module) => module.LoginComponent),
    title: 'Sign in · Automotive Search',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/app-shell.component').then((module) => module.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'search' },
      {
        path: 'conversation',
        canActivate: [capabilityGuard],
        data: { capability: 'catalog.read' },
        loadComponent: () =>
          import('./features/conversation.component').then(
            (module) => module.ConversationComponent,
          ),
        title: 'Automotive assistant · Automotive Search',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./features/search.component').then((module) => module.SearchComponent),
        title: 'Catalog search · Automotive Search',
      },
      {
        path: 'parts/:id',
        loadComponent: () =>
          import('./features/part-detail.component').then((module) => module.PartDetailComponent),
        title: 'Part details · Automotive Search',
      },
      {
        path: 'users',
        canActivate: [capabilityGuard],
        data: { capability: 'organization.users.read' },
        loadComponent: () =>
          import('./features/users.component').then((module) => module.UsersComponent),
        title: 'People · Automotive Search',
      },
      {
        path: 'entitlements',
        canActivate: [capabilityGuard],
        data: { capability: 'organization.entitlements.read' },
        loadComponent: () =>
          import('./features/entitlements.component').then(
            (module) => module.EntitlementsComponent,
          ),
        title: 'Organization access · Automotive Search',
      },
      {
        path: 'taxonomy',
        canActivate: [capabilityGuard],
        data: { capability: 'taxonomy.manage' },
        loadComponent: () =>
          import('./features/taxonomy.component').then((module) => module.TaxonomyComponent),
        title: 'Taxonomy · Automotive Search',
      },
      {
        path: 'audit',
        canActivate: [capabilityGuard],
        data: { capability: 'audit.read' },
        loadComponent: () =>
          import('./features/audit.component').then((module) => module.AuditComponent),
        title: 'Audit trail · Automotive Search',
      },
      {
        path: 'denied',
        loadComponent: () =>
          import('./features/state-pages.component').then((module) => module.AccessDeniedComponent),
        title: 'Access unavailable · Automotive Search',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/state-pages.component').then((module) => module.NotFoundComponent),
    title: 'Page not found · Automotive Search',
  },
];
