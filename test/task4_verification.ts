/**
 * Automated Verification Suite for Task 4:
 * - Supabase Auth Middleware protection (`middleware.ts`)
 * - Token extraction and JWT verification (`extractJwtToken` & `evaluarSesionSupabase`)
 * - Sidebar Navigation Component (`components/Sidebar.tsx`)
 * - Environment Variable Template (`.env.example`)
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server.js';
import { middleware, evaluarSesionSupabase, extractJwtToken, config as middlewareConfig } from '../middleware.ts';

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// Mock Supabase Auth Client for Unit Testing
const mockAuthClient = {
  auth: {
    getUser: async (jwtToken: string) => {
      if (
        jwtToken === 'valid_jwt_token_12345' ||
        jwtToken === 'valid_session_token_xyz' ||
        jwtToken.startsWith('eyJhbGciOiJIUzI1Ni')
      ) {
        return {
          data: {
            user: {
              id: 'mock-user-uuid-12345',
              email: 'usuario@pospin.com',
              user_metadata: { full_name: 'Usuario POSPIN' },
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: new Error('Invalid JWT signature or expired token') };
    },
  },
};

async function runTask4Tests() {
  console.log('=== Starting Task 4 Verification Suite ===\n');

  // -------------------------------------------------------------
  // Test 1: extractJwtToken & evaluarSesionSupabase Unit Tests
  // -------------------------------------------------------------
  console.log('Test 1: extractJwtToken and evaluarSesionSupabase JWT verification...');

  // 1a. No session cookies or header -> extractJwtToken returns null, evaluarSesionSupabase returns false
  const reqNoSession = new NextRequest(new URL('http://localhost:3000/flujo-caja'));
  assert(
    extractJwtToken(reqNoSession) === null,
    'extractJwtToken should return null when no auth cookie or header is present'
  );
  assert(
    (await evaluarSesionSupabase(reqNoSession, mockAuthClient as any)) === false,
    'evaluarSesionSupabase should return false when no auth cookie or header is present'
  );

  // 1b. Bearer Authorization header -> valid JWT verification -> true
  const reqBearerHeader = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken' },
  });
  assert(
    extractJwtToken(reqBearerHeader) === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken',
    'extractJwtToken should extract token from Bearer header'
  );
  assert(
    (await evaluarSesionSupabase(reqBearerHeader, mockAuthClient as any)) === true,
    'evaluarSesionSupabase should return true for valid Bearer token'
  );

  // 1c. Standard Supabase access token cookie -> valid JWT verification -> true
  const reqAccessTokenCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-access-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken' },
  });
  assert(
    (await evaluarSesionSupabase(reqAccessTokenCookie, mockAuthClient as any)) === true,
    'evaluarSesionSupabase should return true for valid sb-access-token cookie'
  );

  // 1d. Project-specific Supabase auth token cookie (JSON format) -> true
  const reqProjectAuthCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: {
      cookie:
        'sb-xyzcompany-auth-token={"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken"}',
    },
  });
  assert(
    extractJwtToken(reqProjectAuthCookie) === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken',
    'extractJwtToken should extract access_token from JSON cookie'
  );
  assert(
    (await evaluarSesionSupabase(reqProjectAuthCookie, mockAuthClient as any)) === true,
    'evaluarSesionSupabase should return true for JSON auth cookie containing valid JWT'
  );

  // 1e. Empty / Whitespace cookie value -> false
  const reqEmptyCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-access-token=   ' },
  });
  assert(
    (await evaluarSesionSupabase(reqEmptyCookie, mockAuthClient as any)) === false,
    'evaluarSesionSupabase should return false for empty/whitespace cookie value'
  );

  // 1f. SECURITY TEST: Fake / Invalid / Tampered token string -> false
  const reqFakeToken = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-access-token=fake_unauthorized_token_123' },
  });
  assert(
    (await evaluarSesionSupabase(reqFakeToken, mockAuthClient as any)) === false,
    'SECURITY CHECK: evaluarSesionSupabase MUST return false for fake/invalid JWT tokens'
  );

  console.log('✓ extractJwtToken & evaluarSesionSupabase unit tests passed.');

  // -------------------------------------------------------------
  // Test 2: Middleware Route Protection (Unauthenticated)
  // -------------------------------------------------------------
  console.log('\nTest 2: Middleware protection for unauthenticated requests...');

  const protectedRoutes = [
    '/flujo-caja',
    '/flujo-caja/facturas',
    '/flujo-caja/importar',
    '/flujo-caja/detalles/123',
  ];

  for (const route of protectedRoutes) {
    const unauthReq = new NextRequest(new URL(`http://localhost:3000${route}`));
    const res = await middleware(unauthReq, mockAuthClient as any);

    assert(
      res.status === 307 || res.status === 302,
      `Unauthenticated request to ${route} should redirect (got status ${res.status})`
    );

    const redirectLocation = res.headers.get('location');
    assert(
      redirectLocation !== null && redirectLocation.includes('/login'),
      `Unauthenticated redirect location should point to /login (got ${redirectLocation})`
    );

    assert(
      redirectLocation !== null &&
        redirectLocation.includes(`redirectTo=${encodeURIComponent(route)}`),
      `Redirect URL should preserve intended destination path in search params`
    );
  }

  console.log('✓ Middleware correctly redirects unauthenticated users on all protected routes.');

  // -------------------------------------------------------------
  // Test 3: Middleware Access Control (Authenticated)
  // -------------------------------------------------------------
  console.log('\nTest 3: Middleware access for authenticated requests...');

  for (const route of protectedRoutes) {
    const authReq = new NextRequest(new URL(`http://localhost:3000${route}`), {
      headers: { cookie: 'sb-access-token=valid_session_token_xyz' },
    });
    const res = await middleware(authReq, mockAuthClient as any);

    // NextResponse.next() returns a 200 response without redirect headers
    assert(
      res.status === 200 && res.headers.get('location') === null,
      `Authenticated request to ${route} should be allowed (status ${res.status}, no redirect)`
    );
  }

  console.log('✓ Middleware correctly allows authenticated requests on all protected routes.');

  // -------------------------------------------------------------
  // Test 4: Middleware Handling of Public Routes & API Route Protection
  // -------------------------------------------------------------
  console.log('\nTest 4: Middleware handling of public routes & API route protection...');

  const publicRoutes = ['/login', '/', '/about'];

  for (const route of publicRoutes) {
    const publicReq = new NextRequest(new URL(`http://localhost:3000${route}`));
    const res = await middleware(publicReq, mockAuthClient as any);

    assert(
      res.status === 200 && res.headers.get('location') === null,
      `Public route ${route} should pass through without redirect`
    );
  }

  // API route protection test: unauthenticated /api/siigo/sync returns 401
  const unauthApiReq = new NextRequest(new URL('http://localhost:3000/api/siigo/sync'), { method: 'POST' });
  const unauthApiRes = await middleware(unauthApiReq, mockAuthClient as any);
  assert(
    unauthApiRes.status === 401,
    `Unauthenticated API request to /api/siigo/sync must return 401 (got ${unauthApiRes.status})`
  );

  // Authenticated API request to /api/siigo/sync passes through (200)
  const authApiReq = new NextRequest(new URL('http://localhost:3000/api/siigo/sync'), {
    method: 'POST',
    headers: { authorization: 'Bearer valid_session_token_xyz' },
  });
  const authApiRes = await middleware(authApiReq, mockAuthClient as any);
  assert(
    authApiRes.status === 200,
    `Authenticated API request to /api/siigo/sync must pass through (got ${authApiRes.status})`
  );

  console.log('✓ Middleware allows public routes and protects /api/* routes with 401.');

  // -------------------------------------------------------------
  // Test 5: Matcher Config & Sidebar Component Verification
  // -------------------------------------------------------------
  console.log('\nTest 5: Matcher config & Sidebar dynamic auth integration...');

  // Matcher rules check
  assert(
    Array.isArray(middlewareConfig.matcher) && middlewareConfig.matcher.length >= 2,
    'middleware config.matcher must be an array with at least 2 pattern definitions'
  );
  assert(
    middlewareConfig.matcher.includes('/flujo-caja') &&
      middlewareConfig.matcher.includes('/flujo-caja/:path*'),
    'middleware config.matcher must include /flujo-caja and /flujo-caja/:path*'
  );

  // Sidebar links check
  const requiredNavHrefs = ['/', '/flujo-caja', '/flujo-caja/facturas', '/flujo-caja/importar'];
  const sidebarPath = path.join(process.cwd(), 'components/Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

  for (const requiredHref of requiredNavHrefs) {
    assert(
      sidebarContent.includes(`href="${requiredHref}"`) || sidebarContent.includes(`href: '${requiredHref}'`) || sidebarContent.includes(`href: "${requiredHref}"`),
      `Sidebar.tsx must include link to ${requiredHref}`
    );
  }

  assert(
    sidebarContent.includes('supabase.auth.getUser()'),
    'Sidebar.tsx must call supabase.auth.getUser() to fetch user state'
  );
  assert(
    sidebarContent.includes('onAuthStateChange'),
    'Sidebar.tsx must register onAuthStateChange session listener'
  );
  assert(
    sidebarContent.includes('supabase.auth.signOut()'),
    'Sidebar.tsx must call supabase.auth.signOut() on logout'
  );

  console.log('✓ Matcher config and Sidebar dynamic auth integration verified.');

  // -------------------------------------------------------------
  // Test 6: Environment Variables Template (.env.example)
  // -------------------------------------------------------------
  console.log('\nTest 6: Checking .env.example environment variable template...');

  const envPath = path.join(process.cwd(), '.env.example');
  assert(fs.existsSync(envPath), '.env.example file must exist');

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SIIGO_USERNAME',
    'SIIGO_ACCESS_KEY',
    'SIIGO_PARTNER_ID',
  ];

  for (const envVar of requiredEnvVars) {
    assert(
      envContent.includes(envVar),
      `.env.example must define template variable ${envVar}`
    );
  }

  console.log('✓ .env.example contains all required Supabase and SIIGO environment variables.');

  console.log('\n=============================================');
  console.log(' ALL TASK 4 VERIFICATION TESTS PASSED SUCCESSFULLY! ');
  console.log('=============================================\n');
}

runTask4Tests().catch((err) => {
  console.error('\n❌ Task 4 Verification Suite Failed:', err);
  process.exit(1);
});

