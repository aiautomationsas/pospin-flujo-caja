/**
 * Verification test suite for Task 2:
 * - lib/siigo.ts
 * - lib/flujo_caja_engine.ts
 * - app/api/siigo/sync/route.ts
 */

import { SiigoAPIClient, sincronizarCarteraSiigo } from '../lib/siigo.ts';
import {
  evaluarRecurrencia,
  getISOWeekAndYear,
  generarSemanasFuturas,
  calcularProyeccionFlujoCaja,
  guardarSnapshotProyeccion,
  obtenerCalibracionProyeccion,
  obtenerSaldoPorCuenta,
  obtenerRecaudoPendienteCliente,
  obtenerAlertasDeficit,
} from '../lib/flujo_caja_engine.ts';
import { POST as syncRouteHandler } from '../app/api/siigo/sync/route.ts';

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('=== Starting Task 2 Verification Tests ===\n');

  // -------------------------------------------------------------
  // Test 1: evaluarRecurrencia
  // -------------------------------------------------------------
  console.log('Test 1: evaluarRecurrencia...');
  
  // Weekly
  assert(
    evaluarRecurrencia(
      { id: 1, categoria_id: 1, tercero: 'Internet', frecuencia: 'semanal', dia_pago: 1, monto_estimado: 100, activa: true, created_at: '' },
      '2026-08-10',
      '2026-08-16'
    ) === true,
    'Weekly recurrence should be true'
  );

  // Quincenal - week containing 15th
  assert(
    evaluarRecurrencia(
      { id: 2, categoria_id: 1, tercero: 'Nomina', frecuencia: 'quincenal', dia_pago: 15, monto_estimado: 500, activa: true, created_at: '' },
      '2026-08-10',
      '2026-08-16'
    ) === true,
    'Quincenal recurrence for week with 15th should be true'
  );

  // Quincenal - week without 15th or end of month
  assert(
    evaluarRecurrencia(
      { id: 2, categoria_id: 1, tercero: 'Nomina', frecuencia: 'quincenal', dia_pago: 15, monto_estimado: 500, activa: true, created_at: '' },
      '2026-08-03',
      '2026-08-09'
    ) === false,
    'Quincenal recurrence for week without 15th/end of month should be false'
  );

  // Mensual - day 20
  assert(
    evaluarRecurrencia(
      { id: 3, categoria_id: 2, tercero: 'Arriendo', frecuencia: 'mensual', dia_pago: 20, monto_estimado: 1200, activa: true, created_at: '' },
      '2026-08-17',
      '2026-08-23'
    ) === true,
    'Monthly recurrence should match day 20'
  );

  // Semestral - June (6) and Dec (12) on 15th -> code 615
  assert(
    evaluarRecurrencia(
      { id: 4, categoria_id: 3, tercero: 'Prima', frecuencia: 'semestral', dia_pago: 615, monto_estimado: 3000, activa: true, created_at: '' },
      '2026-12-14',
      '2026-12-20'
    ) === true,
    'Semestral recurrence should match December 15th'
  );

  console.log('✓ evaluarRecurrencia passed.');

  // -------------------------------------------------------------
  // Test 2: getISOWeekAndYear
  // -------------------------------------------------------------
  console.log('\nTest 2: getISOWeekAndYear...');
  const { week, year } = getISOWeekAndYear(new Date('2026-08-13'));
  assert(week > 0 && week <= 53, 'Week should be valid ISO week');
  assert(year === 2026, 'Year should be 2026');
  console.log(`✓ getISOWeekAndYear passed (Week ${week}, Year ${year}).`);

  // -------------------------------------------------------------
  // Test 3: SiigoAPIClient credentials & token caching
  // -------------------------------------------------------------
  console.log('\nTest 3: SiigoAPIClient token caching & headers...');
  const client = new SiigoAPIClient({
    username: 'test@pospin.com',
    access_key: 'key123',
    partner_id: 'partner456',
  });

  // Mock global fetch
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCallCount++;
    const urlStr = input.toString();
    if (urlStr.includes('/auth')) {
      return new Response(
        JSON.stringify({
          access_token: 'mock_token_abc123',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/v1/invoices')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'inv1',
              prefix: 'FE-',
              number: 101,
              date: '2026-08-01',
              total: 500000,
              due: { balance: 500000, date: '2026-08-30' },
              customer: { identification: '900123456', name: 'Empresa Test SAS' },
            },
          ],
          pagination: { total_results: 1, page: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 444 });
  }) as typeof fetch;

  const token1 = await client.obtenerToken();
  const token2 = await client.obtenerToken();
  assert(token1 === 'mock_token_abc123', 'Token should match mock response');
  assert(token2 === token1, 'Cached token should be returned');
  assert(fetchCallCount === 1, 'Fetch should only be called once for cached token');

  const invoices = await client.consultarFacturasVenta(30);
  assert(invoices.length === 1, 'Invoices length should be 1');
  assert(invoices[0].number === 101, 'Invoice number should be 101');
  console.log('✓ SiigoAPIClient passed.');

  // -------------------------------------------------------------
  // Test 4: sincronizarCarteraSiigo with Mock Supabase
  // -------------------------------------------------------------
  console.log('\nTest 4: sincronizarCarteraSiigo with Mock Supabase...');

  const mockDbClientes: any[] = [];
  const mockDbFacturas: any[] = [];

  const mockSupabase = {
    from: (tableName: string) => {
      return {
        select: (cols: string) => {
          return {
            eq: (field: string, val: any) => {
              return {
                limit: (lim: number) => {
                  if (tableName === 'clientes') {
                    const found = mockDbClientes.filter((c) => c[field] === val);
                    return Promise.resolve({ data: found, error: null });
                  }
                  if (tableName === 'facturas') {
                    const found = mockDbFacturas.filter((f) => f[field] === val);
                    return Promise.resolve({ data: found, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
        insert: (data: any) => {
          if (tableName === 'clientes') {
            const newObj = { id: mockDbClientes.length + 1, ...data };
            mockDbClientes.push(newObj);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: newObj, error: null }),
              }),
            };
          }
          if (tableName === 'facturas') {
            const newObj = { id: mockDbFacturas.length + 1, ...data };
            mockDbFacturas.push(newObj);
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
        },
        update: (data: any) => {
          return {
            eq: (field: string, val: any) => {
              if (tableName === 'facturas') {
                const idx = mockDbFacturas.findIndex((f) => f[field] === val);
                if (idx >= 0) {
                  Object.assign(mockDbFacturas[idx], data);
                }
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  const syncStats = await sincronizarCarteraSiigo(mockSupabase, client);
  assert(syncStats.exitosa === true, 'Sync should be successful');
  assert(syncStats.clientes_creados === 1, '1 client should be created');
  assert(syncStats.facturas_creadas === 1, '1 invoice should be created');
  assert(mockDbClientes.length === 1, 'Mock DB should contain 1 client');
  assert(mockDbFacturas[0].numero === 'FE-101', 'Invoice number should be FE-101');
  assert(mockDbFacturas[0].estado === 'pendiente', 'Invoice status should be pendiente');

  console.log('✓ sincronizarCarteraSiigo passed.');

  // -------------------------------------------------------------
  // Test 5: calcularProyeccionFlujoCaja with Mock Supabase
  // -------------------------------------------------------------
  console.log('\nTest 5: calcularProyeccionFlujoCaja...');

  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const mockDbSemanas = [
    { id: 1, numero: 33, anio: 2026, fecha_inicio: todayStr, fecha_fin: nextWeekStr },
  ];
  const mockDbFacturasProj = [
    { id: 10, valor: 1000, fecha_estimada_recaudo: todayStr, estado: 'pendiente' },
  ];
  const mockDbRecurrentes = [
    { id: 1, categoria_id: 5, tercero: 'Proveedor X', frecuencia: 'semanal', dia_pago: 1, monto_estimado: 200, activa: true },
  ];
  const mockDbSaldos = [
    { id: 1, semana_id: 1, cuenta_id: 1, saldo: 500 },
  ];

  const mockSupabaseEngine = {
    from: (tableName: string) => {
      let chain: any = {
        select: (cols: string) => chain,
        gte: (col: string, val: any) => chain,
        lte: (col: string, val: any) => chain,
        eq: (col: string, val: any) => chain,
        in: (col: string, vals: any[]) => chain,
        order: (col: string, opts: any) => chain,
        limit: (lim: number) => {
          if (tableName === 'semanas') {
            return Promise.resolve({ data: mockDbSemanas, error: null });
          }
          if (tableName === 'snapshots_proyeccion') {
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };

      // Handle async resolutions for select queries without limit
      chain.then = (resolve: any) => {
        if (tableName === 'facturas') {
          resolve({ data: mockDbFacturasProj, error: null });
        } else if (tableName === 'recaudos') {
          resolve({ data: [], error: null });
        } else if (tableName === 'egresos_recurrentes') {
          resolve({ data: mockDbRecurrentes, error: null });
        } else if (tableName === 'saldos_semanales') {
          resolve({ data: mockDbSaldos, error: null });
        } else if (tableName === 'egresos') {
          resolve({ data: [], error: null });
        } else if (tableName === 'compromisos') {
          resolve({ data: [], error: null });
        } else {
          resolve({ data: [], error: null });
        }
      };

      return chain;
    },
  };

  const proyecciones = await calcularProyeccionFlujoCaja(mockSupabaseEngine, 12);
  assert(proyecciones.length === 1, 'Should return 1 projection week');
  assert(proyecciones[0].saldo_inicial === 500, 'Saldo inicial should be 500');
  assert(proyecciones[0].recaudo === 1000, 'Recaudo projected should be 1000');
  assert(proyecciones[0].egresos === 200, 'Egresos recurrente should be 200');
  assert(proyecciones[0].saldo_final === 1300, 'Saldo final should be 500 + 1000 - 200 = 1300');
  assert(proyecciones[0].deficit === false, 'Deficit should be false');

  console.log('✓ calcularProyeccionFlujoCaja passed.');

  // -------------------------------------------------------------
  // Test 6: Route Handler validation
  // -------------------------------------------------------------
  console.log('\nTest 6: app/api/siigo/sync Route Handler...');

  // 400 when missing credentials
  const req400 = new Request('http://localhost:3000/api/siigo/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res400 = await syncRouteHandler(req400);
  assert(res400.status === 400, 'Route handler should return 400 for missing credentials');

  console.log('✓ app/api/siigo/sync Route Handler passed.');

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('\n=============================================');
  console.log(' ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ');
  console.log('=============================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
