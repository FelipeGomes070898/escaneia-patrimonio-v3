import { NextRequest, NextResponse } from 'next/server';
import { buscarDadosDoGoverno } from '@/lib/govLookup';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Busca os dados de um bem no sistema do governo (e-estado.ro.gov.br).
 *  Roda no servidor — sem bloqueio de CORS e sem precisar de nenhum
 *  proxy externo (Worker/Cloudflare), diferente da versão anterior. */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'nao_autenticado', detail: 'Faça login para usar esta função.' }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url_ausente', detail: 'Parâmetro "url" ausente.' }, { status: 400 });
  }

  const resultado = await buscarDadosDoGoverno(url);
  if ('error' in resultado) {
    return NextResponse.json(resultado, { status: 200 });
  }
  return NextResponse.json(resultado, { status: 200 });
}
