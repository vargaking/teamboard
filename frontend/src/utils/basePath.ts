/**
 * Deployment base path (Vite `base`, from VITE_BASE at build time). Always has a leading and
 * trailing slash: "/" by default, e.g. "/board/" when served under a path prefix.
 */
export const BASE_URL: string = import.meta.env.BASE_URL;

/** Router basename: "/board" (React Router prefers no trailing slash), or "/" at the root. */
export const ROUTER_BASENAME: string = BASE_URL === '/' ? '/' : BASE_URL.replace(/\/+$/, '');

/** Absolute path for an app route or API path, e.g. appPath('login') -> "/board/login". */
export function appPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, '')}`;
}

/** Full URL (origin + base) for sharing, e.g. "https://vm.example/board/boards/3?card=7". */
export function appUrl(path: string): string {
  return `${window.location.origin}${appPath(path)}`;
}

export const LOGIN_PATH = appPath('login');

/** Current location as an app route (base stripped) incl. query, e.g. "/oauth/consent?req=x". */
export function currentAppLocation(): string {
  const { pathname, search } = window.location;
  const route = pathname.startsWith(BASE_URL) ? `/${pathname.slice(BASE_URL.length)}` : pathname;
  return `${route}${search}`;
}

/**
 * Validate a `next` redirect target: must be an app-relative path ("/..."), not protocol-relative
 * ("//evil") or a backslash trick, and not the login page itself. Returns "/" otherwise.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (next === '/login' || next.startsWith('/login?')) return '/';
  return next;
}

/** Login route preserving where the user was going, e.g. "/login?next=%2Foauth%2Fconsent%3Freq%3Dx". */
export function loginRouteFor(next: string): string {
  const target = safeNextPath(next);
  return target === '/' ? '/login' : `/login?next=${encodeURIComponent(target)}`;
}

/** Hard redirect to the login page (used outside React: axios interceptor, socket close). */
export function redirectToLogin(): void {
  if (window.location.pathname === LOGIN_PATH) return;
  window.location.assign(appPath(loginRouteFor(currentAppLocation())));
}
