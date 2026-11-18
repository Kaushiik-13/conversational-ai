import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink],
  template: `
    <section class="state-page">
      <span class="state-code">403</span>
      <p class="eyebrow">Access unavailable</p>
      <h1>This area is outside your role.</h1>
      <p>Your organization and role are working as intended. You can return to the catalog.</p>
      <a class="button button--primary" routerLink="/search">Back to search</a>
    </section>
  `,
})
export class AccessDeniedComponent {}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <main class="standalone-state">
      <section class="state-page">
        <span class="state-code">404</span>
        <p class="eyebrow">Page not found</p>
        <h1>That road ends here.</h1>
        <p>The page may have moved, or the address may be incomplete.</p>
        <a class="button button--primary" routerLink="/search">Go to catalog</a>
      </section>
    </main>
  `,
})
export class NotFoundComponent {}
