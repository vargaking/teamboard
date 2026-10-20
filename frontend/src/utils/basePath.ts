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

/** Hard redirect to the login page (used outside React: axios interceptor, socket close). */
export function redirectToLogin(): void {
  if (window.location.pathname !== LOGIN_PATH) window.location.assign(LOGIN_PATH);
}
