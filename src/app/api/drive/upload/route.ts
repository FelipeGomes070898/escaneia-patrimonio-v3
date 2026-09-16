import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enviarFotoParaDrive } from '@/lib/googleDrive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB

/** Recebe uma foto (do formulário de Levantamento) e envia pro Google
 *  Drive, dentro da pasta do local correspondente. Só usuários logados e
 *  aprovados podem chamar essa rota. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  }

  const { data: perfil } = await supabase.from('patrimonio_perfis').select('aprovado').eq('id', user.id).maybeSingle();
  if (!perfil?.aprovado) {
    return NextResponse.json({ error: 'Conta ainda não aprovada.' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  const local = String(form?.get('local') || 'Sem local');
  const nomeArquivo = String(form?.get('nomeArquivo') || `foto-${Date.now()}.jpg`);

  if (!arquivo || !(arquivo instanceof Blob)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: 'A foto é muito grande (máximo 8 MB).' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await enviarFotoParaDrive({
      local,
      nomeArquivo,
      mimeType: arquivo.type || 'image/jpeg',
      buffer
    });
    return NextResponse.json({ ok: true, link: resultado.link, id: resultado.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível enviar a foto pro Google Drive.' }, { status: 500 });
  }
}
