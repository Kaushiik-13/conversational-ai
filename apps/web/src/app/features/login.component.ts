import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiErrorMessage } from '../core/models';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-page">
      <section class="login-story">
        <a class="brand brand--light" href="/" aria-label="Automotive Search home">
          <span class="brand-mark">AS</span>
          <span>Automotive Search</span>
        </a>
        <div>
          <p class="eyebrow eyebrow--light">Secure parts intelligence</p>
          <h1>Five million parts.<br />Only the right ones.</h1>
          <p>
            Search the automotive catalog through ParadeDB with organization, role, category, and
            field access applied before any result reaches your screen.
          </p>
        </div>
        <div class="login-proof">
          <span>5M</span><small>catalog records</small> <span>4</span
          ><small>controlled organizations</small>
        </div>
      </section>

      <section class="login-panel">
        <form class="login-card" [formGroup]="form" (ngSubmit)="submit()">
          <div>
            <p class="eyebrow">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p class="muted">Use the development account assigned to your organization.</p>
          </div>

          <label>
            Work email
            <input
              type="email"
              formControlName="email"
              autocomplete="username"
              placeholder="you@organization.test"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              formControlName="password"
              autocomplete="current-password"
              placeholder="At least 12 characters"
            />
          </label>

          @if (error()) {
            <div class="notice notice--error" role="alert">
              <strong>Sign-in failed</strong>
              <span>{{ error() }}</span>
            </div>
          }

          <button class="button button--primary button--wide" type="submit" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
          <p class="form-footnote">Access is monitored and security actions are audited.</p>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12)],
    }),
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.form.controls.email.value, this.form.controls.password.value);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/search');
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Check your email and password, then try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
