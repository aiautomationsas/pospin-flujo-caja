/**
 * Automated Verification Suite for Task 4:
 * - Supabase Auth Middleware protection (`middleware.ts`)
 * - Session evaluation logic (`evaluarSesionSupabase`)
 * - Sidebar Navigation Component (`components/Sidebar.tsx`)
 * - Environment Variable Template (`.env.example`)
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { middleware, evaluarSesionSupabase, config as middlewareConfig } from '../middleware.ts';
import { navItems } from '../components/Sidebar.tsx';

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTask4Tests() {
  console.log('=== Starting Task 4 Verification Suite ===\n');

  // -------------------------------------------------------------
  // Test 1: evaluarSesionSupabase Unit Tests
  // -------------------------------------------------------------
  console.log('Test 1: evaluarSesionSupabase session evaluation...');

  // 1a. No session cookies or header -> false
  const reqNoSession = new NextRequest(new URL('http://localhost:3000/flujo-caja'));
  assert(
    evaluarSesionSupabase(reqNoSession) === false,
    'evaluarSesionSupabase should return false when no auth cookie or header is present'
  );

  // 1b. Bearer Authorization header -> true
  const reqBearerHeader = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validtoken' },
  });
  assert(
    evaluarSesionSupabase(reqBearerHeader) === true,
    'evaluarSesionSupabase should return true for valid Bearer token in authorization header'
  );

  // 1c. Standard Supabase access token cookie -> true
  const reqAccessTokenCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-access-token=sb_mock_access_token_12345' },
  });
  assert(
    evaluarSesionSupabase(reqAccessTokenCookie) === true,
    'evaluarSesionSupabase should return true for sb-access-token cookie'
  );

  // 1d. Project-specific Supabase auth token cookie -> true
  const reqProjectAuthCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-xyzcompany-auth-token={"access_token":"mock_jwt"}' },
  });
  assert(
    evaluarSesionSupabase(reqProjectAuthCookie) === true,
    'evaluarSesionSupabase should return true for sb-*-auth-token cookie'
  );

  // 1e. Empty/Whitespace cookie value -> false
  const reqEmptyCookie = new NextRequest(new URL('http://localhost:3000/flujo-caja'), {
    headers: { cookie: 'sb-access-token=   ' },
  });
  assert(
    evaluarSesionSupabase(reqEmptyCookie) === false,
    'evaluarSesionSupabase should return false for empty/whitespace cookie value'
  );

  console.log('✓ evaluarSesionSupabase unit tests passed.');

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
    const res = middleware(unauthReq);

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
      redirectLocation !== null && redirectLocation.includes(`redirectTo=${encodeURIComponent(route)}`),
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
    const res = middleware(authReq);

    // NextResponse.next() returns a 200 response without redirect headers
    assert(
      res.status === 200 && res.headers.get('location') === null,
      `Authenticated request to ${route} should be allowed (status ${res.status}, no redirect)`
    );
  }

  console.log('✓ Middleware correctly allows authenticated requests on all protected routes.');

  // -------------------------------------------------------------
  // Test 4: Middleware Public / Unprotected Routes
  // -------------------------------------------------------------
  console.log('\nTest 4: Middleware handling of public/unprotected routes...');

  const publicRoutes = ['/login', '/', '/api/siigo/sync', '/about'];

  for (const route of publicRoutes) {
    const publicReq = new NextRequest(new URL(`http://localhost:3000${route}`));
    const res = middleware(publicReq);

    assert(
      res.status === 200 && res.headers.get('location') === null,
      `Public route ${route} should pass through without redirect`
    );
  }

  console.log('✓ Middleware allows public routes without redirection.');

  // -------------------------------------------------------------
  // Test 5: Matcher Config & Sidebar Links Verification
  // -------------------------------------------------------------
  console.log('\nTest 5: Sidebar navigation items & matcher config...');

  // Matcher rules check
  assert(
    Array.isArray(middlewareConfig.matcher) && middlewareConfig.matcher.length >= 2,
    'middleware config.matcher must be an array with at least 2 pattern definitions'
  );
  assert(
    middlewareConfig.matcher.includes('/flujo-caja') && middlewareConfig.matcher.includes('/flujo-caja/:path*'),
    'middleware config.matcher must include /flujo-caja and /flujo-caja/:path*'
  );

  // Sidebar links check
  const requiredNavHrefs = ['/', '/flujo-caja', '/flujo-caja/facturas', '/flujo-caja/importar'];
  const actualNavHrefs = navItems.map((item) => item.href);

  for (const requiredHref of requiredNavHrefs) {
    assert(
      actualNavHrefs.includes(requiredHref),
      `Sidebar navItems must include link to ${requiredHref}`
    );
  }

  console.log('✓ Matcher config and Sidebar navigation links verified.');

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
