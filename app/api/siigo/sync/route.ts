import { NextResponse } from 'next/server.js';
import { createClient } from '@supabase/supabase-js';
import { SiigoAPIClient, sincronizarCarteraSiigo } from '../../../../lib/siigo.ts';

export async function POST(request: Request) {
  let body: any = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch (e) {
    // Body is optional or empty
  }

  const username = body.username || process.env.SIIGO_USERNAME;
  const accessKey = body.access_key || process.env.SIIGO_ACCESS_KEY;
  const partnerId = body.partner_id || process.env.SIIGO_PARTNER_ID;
  const baseUrl = body.base_url || process.env.SIIGO_BASE_URL;
  const usuarioId = body.usuario_id || null;

  if (!username || !accessKey || !partnerId) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Faltan credenciales de SIIGO (username, access_key, partner_id son requeridos)',
      },
      { status: 400 }
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Configuración de Supabase no encontrada en variables de entorno',
      },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const siigoClient = new SiigoAPIClient({
    username,
    access_key: accessKey,
    partner_id: partnerId,
    base_url: baseUrl,
  });

  try {
    const stats = await sincronizarCarteraSiigo(supabase, siigoClient);

    // Registrar log de sincronización exitosa
    await supabase.from('siigo_sync_logs').insert({
      fecha: new Date().toISOString(),
      clientes_creados: stats.clientes_creados,
      facturas_creadas: stats.facturas_creadas,
      facturas_actualizadas: stats.facturas_actualizadas,
      exitosa: true,
      error_message: null,
      usuario_id: usuarioId,
    });

    return NextResponse.json(
      {
        success: true,
        stats,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error('Error en Route Handler /api/siigo/sync:', errorMessage);

    // Intentar registrar log de error en Supabase
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
      console.error('Error guardando log de fallo en Supabase:', logErr);
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
