import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from './auth.service';
import { anonymousGuard, authGuard, capabilityGuard } from './guards';

describe('route authorization guards', () => {
  const auth = {
    restore: vi.fn<() => Promise<boolean>>(),
    has: vi.fn<(capability: string) => boolean>(),
  };

  beforeEach(() => {
    auth.restore.mockReset();
    auth.has.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('redirects an anonymous deep link to login with its return URL', async () => {
    auth.restore.mockResolvedValue(false);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/parts/123' } as RouterStateSnapshot),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/login?returnUrl=%2Fparts%2F123',
    );
  });

  it('redirects an authenticated user away from the login page', async () => {
    auth.restore.mockResolvedValue(true);
    const result = await TestBed.runInInjectionContext(() =>
      anonymousGuard({} as ActivatedRouteSnapshot, { url: '/login' } as RouterStateSnapshot),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/search');
  });

  it('allows a route when the active profile has its capability', () => {
    auth.has.mockReturnValue(true);
    const result = TestBed.runInInjectionContext(() =>
      capabilityGuard(
        { data: { capability: 'audit.read' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

    expect(result).toBe(true);
    expect(auth.has).toHaveBeenCalledWith('audit.read');
  });

  it('redirects a missing capability to the denied page', () => {
    auth.has.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() =>
      capabilityGuard(
        { data: { capability: 'taxonomy.manage' } } as unknown as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/denied?capability=taxonomy.manage',
    );
  });
});
