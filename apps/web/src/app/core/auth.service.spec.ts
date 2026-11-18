import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import type { AuthProfile } from './models';

const profile: AuthProfile = {
  user: { id: 'user-1', email: 'admin@example.test', displayName: 'Admin User' },
  activeContext: {
    organizationId: 'org-1',
    organizationCode: 'ORG_A',
    organizationName: 'Organization A',
    membershipId: 'membership-1',
    role: 'GLOBAL_ADMIN',
  },
  memberships: [],
  capabilities: ['catalog.search', 'audit.read'],
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('restores an authenticated profile and exposes capabilities', async () => {
    const restored = service.restore();
    http.expectOne('/api/v1/auth/me').flush({ data: profile, meta: { requestId: 'request-1' } });

    await expect(restored).resolves.toBe(true);
    expect(service.profile()).toEqual(profile);
    expect(service.has('audit.read')).toBe(true);
    expect(service.state()).toBe('authenticated');
  });

  it('uses the pre-authentication CSRF endpoint before login', async () => {
    const login = service.login('admin@example.test', 'long-development-password');
    http.expectOne('/api/v1/auth/csrf').flush({
      data: { csrfToken: 'csrf-token' },
      meta: { requestId: 'request-1' },
    });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/login').flush({ data: profile, meta: { requestId: 'request-2' } });

    await expect(login).resolves.toEqual(profile);
    expect(service.authenticated()).toBe(true);
  });
});
