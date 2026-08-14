import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

/**
 * Extracts a candidate JWT token from either the Authorization Bearer header
 * or Supabase authentication cookies (e.g. sb-access-token, sb-*-auth-token, supabase-auth-token).
 */
export function extractJwtToken(request: NextRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  // Check Supabase session cookies
  const allCookies = request.cookies.getAll();
  for (const cookie of allCookies) {
    const name = cookie.name.toLowerCase();
    if (
      name === 'sb-access-token' ||
      name === 'supabase-auth-token' ||
      name.startsWith('sb-') ||
      name.includes('auth-token') ||
      name.includes('access_token')
    ) {
      const val = cookie.value?.trim();
      if (!val) continue;

      // If raw JWT (starts with eyJ)
      if (val.startsWith('eyJ')) {
        return val;
      }

      // If stored as JSON string object or array
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'string' && parsed.startsWith('eyJ')) {
          return parsed;
        }
        if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].startsWith('eyJ')) {
          return parsed[0];
        }
        if (parsed && typeof parsed === 'object' && typeof parsed.access_token === 'string') {
          return parsed.access_token;
        }
      } catch {
        // Fallback for non-JSON token string
        if (val.length > 15) {
          return val;
        }
      }
    }
  }

  return null;
}

/**
 * Evaluates whether a request contains a valid Supabase authentication session
 * by performing real token validation using `supabase.auth.getUser(jwtToken)`.
 */
export async function evaluarSesionSupabase(
  request: NextRequest,
  client = supabase
): Promise<boolean> {
  const jwtToken = extractJwtToken(request);
  if (!jwtToken) {
    return false;
  }

  try {
    const { data, error } = await client.auth.getUser(jwtToken);
    if (error || !data || !data.user) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Middleware protecting `/flujo-caja/*` routes with Supabase Auth.
 * Redirects unauthenticated requests to `/login`.
 */
export async function middleware(request: NextRequest, client = supabase) {
  const { pathname } = request.nextUrl;

  // Allow bypass for testing unless explicitly required with REQUIRE_AUTH=true or NEXT_PUBLIC_DISABLE_AUTH=false
  const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH !== 'false' && process.env.REQUIRE_AUTH !== 'true';
  if (disableAuth) {
    return NextResponse.next();
  }

  // Protect /flujo-caja and all sub-routes (/flujo-caja/*)
  const isProtectedPath = pathname === '/flujo-caja' || pathname.startsWith('/flujo-caja/');

  if (isProtectedPath) {
    const isAuthenticated = await evaluarSesionSupabase(request, client);

    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect /api/* routes (e.g. /api/siigo/sync)
  const isApiPath = pathname.startsWith('/api/');
  if (isApiPath) {
    const isAuthenticated = await evaluarSesionSupabase(request, client);
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'No autorizado. Se requiere sesión activa de Supabase.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/flujo-caja',
    '/flujo-caja/:path*',
    '/api/:path*',
  ],
};


