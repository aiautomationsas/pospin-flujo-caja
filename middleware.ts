import { NextResponse, type NextRequest } from 'next/server';

/**
 * Evaluates whether a request contains a valid Supabase authentication session.
 * Checks:
 * 1. Authorization header (Bearer token)
 * 2. Supabase auth cookies (e.g. sb-access-token, sb-*-auth-token, supabase-auth-token)
 */
export function evaluarSesionSupabase(request: NextRequest): boolean {
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ') && authHeader.trim().length > 15) {
    return true;
  }

  // Check Supabase session cookies
  const allCookies = request.cookies.getAll();
  for (const cookie of allCookies) {
    const name = cookie.name.toLowerCase();
    if (
      name === 'sb-access-token' ||
      name === 'supabase-auth-token' ||
      name.startsWith('sb-') ||
      name.includes('auth-token')
    ) {
      if (cookie.value && cookie.value.trim().length > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Middleware protecting `/flujo-caja/*` routes with Supabase Auth.
 * Redirects unauthenticated requests to `/login`.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /flujo-caja and all sub-routes (/flujo-caja/*)
  const isProtectedPath = pathname === '/flujo-caja' || pathname.startsWith('/flujo-caja/');

  if (isProtectedPath) {
    const isAuthenticated = evaluarSesionSupabase(request);

    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/flujo-caja',
    '/flujo-caja/:path*',
  ],
};
