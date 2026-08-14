import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SiigoAPIClient, sincronizarCarteraSiigo } from '@/lib/siigo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // Body opcional
  }

  const reqUsername = typeof body.username === 'string' ? body.username.trim() : '';
  const reqAccessKey = typeof body.access_key === 'string' ? body.access_key.trim() : '';
  const reqPartnerId = typeof body.partner_id === 'string' ? body.partner_id.trim() : '';

  const username = reqUsername || process.env.SIIGO_USERNAME || '';
  const accessKey = reqAccessKey || process.env.SIIGO_ACCESS_KEY || '';
  const partnerId = reqPartnerId || process.env.SIIGO_PARTNER_ID || 'pospin_flujo_caja';
  const baseUrl = (body.base_url as string) || process.env.SIIGO_BASE_URL || 'https://api.siigo.com';
  const usuarioId = (body.usuario_id as string) || null;
  const isTestOnly = Boolean(body.testOnly);
  const isDebug = Boolean(body.debug);

  if (!username || !accessKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Faltan credenciales de SIIGO. Configure SIIGO_USERNAME y SIIGO_ACCESS_KEY en las variables de entorno (.env) del servidor o ingréselas en el formulario.',
      },
      { status: 400 }
    );
  }

  const siigoClient = new SiigoAPIClient({
    username,
    access_key: accessKey,
    partner_id: partnerId,
    base_url: baseUrl,
  });

  if (isDebug) {
    try {
      const facturas = await siigoClient.consultarFacturasVenta(0); // 0 = Todo el historial
      const paidInvoices = facturas.filter((f) => Number(f.balance || 0) === 0);
      const partialInvoices = facturas.filter((f) => Number(f.balance || 0) > 0 && Number(f.balance || 0) < Number(f.total || 0));
      const unpaidInvoices = facturas.filter((f) => Number(f.balance || 0) === Number(f.total || 0));

      const paymentsWithPaidKey = facturas.filter((f) =>
        f.payments?.some((p) => (p as Record<string, unknown>).paid !== undefined)
      );

      return NextResponse.json({
        success: true,
        total_invoices_fetched: facturas.length,
        summary: {
          paid_count: paidInvoices.length,
          partial_count: partialInvoices.length,
          unpaid_count: unpaidInvoices.length,
          payments_with_paid_flag_count: paymentsWithPaidKey.length,
        },
        sample_invoice: facturas[0] || null,
        sample_paid_invoice: paidInvoices[0] || null,
        sample_partial_invoice: partialInvoices[0] || null,
        sample_payment_object: facturas[0]?.payments?.[0] || null,
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
    }
  }

  if (isTestOnly) {
    try {
      await siigoClient.obtenerToken();
      return NextResponse.json(
        {
          success: true,
          message: 'Autenticación con SIIGO API exitosa.',
        },
        { status: 200 }
      );
    } catch (authErr: unknown) {
      const authMsg = (authErr as Error).message || String(authErr);
      return NextResponse.json(
        {
          success: false,
          error: `Error de autenticación con SIIGO: ${authMsg}`,
        },
        { status: 401 }
      );
    }
  }

  const ACTIVE_SUPABASE_URL = 'https://pviqnnehvbmpiysjpxjh.supabase.co';
  const ACTIVE_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2aXFubmVodmJtcGl5c2pweGpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODc1MTgsImV4cCI6MjA5Nzk2MzUxOH0.ATk6XmopgNs4qvCWJHFhE7oeWomVtUwbv3ZeywwQnWk';

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseUrl = (!rawUrl || rawUrl.includes('xiimvwjmblnxrxfrbzee'))
    ? ACTIVE_SUPABASE_URL
    : rawUrl;

  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  const supabaseKey = (!rawKey || rawKey.includes('xiimvwjmblnxrxfrbzee'))
    ? ACTIVE_SUPABASE_ANON_KEY
    : rawKey;

  let supabase = null;
  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch {
      // Ignorar error de cliente Supabase si las variables están caídas
    }
  }

  try {
    if (!supabase) {
      throw new Error('No se pudo conectar con la base de datos Supabase.');
    }

    if (Boolean(body.resetData) || Boolean(body.reset_data)) {
      try {
        await supabase.from('recaudos').delete().neq('id', 0);
        await supabase.from('facturas').delete().neq('id', 0);
        await supabase.from('clientes').delete().neq('id', 0);
      } catch (resetErr) {
        console.warn('Error purgando datos anteriores:', resetErr);
      }
    }

    const diasAtras = Number(body.dias_atras) || 365;
    const stats = await sincronizarCarteraSiigo(supabase, siigoClient, diasAtras);

    // Registrar log de sincronización exitosa
    try {
      await supabase.from('siigo_sync_logs').insert({
        fecha: new Date().toISOString(),
        clientes_creados: stats.clientes_creados,
        facturas_creadas: stats.facturas_creadas,
        facturas_actualizadas: stats.facturas_actualizadas,
        exitosa: true,
        error_message: null,
        usuario_id: usuarioId,
      });
    } catch (logErr) {
      console.warn('No se pudo guardar log exitoso en Supabase:', logErr);
    }

    return NextResponse.json(
      {
        success: true,
        stats,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = (error as Error).message || String(error);
    console.error('Error en Route Handler /api/siigo/sync:', errorMessage);

    if (supabase) {
      try {
        await supabase.from('siigo_sync_logs').insert({
          fecha: new Date().toISOString(),
          clientes_creados: 0,
          facturas_creadas: 0,
          facturas_actualizadas: 0,
          exitosa: false,
          error_message: errorMessage,
          usuario_id: usuarioId,
        });
      } catch (logErr) {
        console.warn('No se pudo registrar log de error en Supabase:', logErr);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 400 }
    );
  }
}
