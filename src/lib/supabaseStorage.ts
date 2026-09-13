import type { SupabaseClient } from '@supabase/supabase-js';

/** Sobe uma foto pro Storage do próprio Supabase (bucket "patrimonio-fotos")
 *  — rápido, sem depender de nenhuma credencial externa (diferente do
 *  Google Drive, que precisa de uma conta de serviço configurada à parte).
 *  Devolve o link público da foto. */
export async function enviarFotoParaStorage(
  supabase: SupabaseClient,
  arquivo: Blob,
  prefixo: string
): Promise<string> {
  const extensao = arquivo.type.includes('png') ? 'png' : 'jpg';
  const nomeSeguro = prefixo.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
  const caminho = `${nomeSeguro}-${Date.now()}.${extensao}`;

  const { error } = await supabase.storage
    .from('patrimonio-fotos')
    .upload(caminho, arquivo, { contentType: arquivo.type || 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('patrimonio-fotos').getPublicUrl(caminho);
  return data.publicUrl;
}

/** Apaga do Storage as fotos (tombo/item) de um ou mais registros, a
 *  partir das URLs públicas salvas no banco — usado quando um registro é
 *  excluído, pra realmente liberar espaço (senão a foto continuaria
 *  ocupando espaço no Storage escondida, mesmo depois de apagar a linha
 *  da tabela). Nunca trava a exclusão: se uma foto específica não puder
 *  ser removida (link antigo, já apagada etc.), simplesmente ignora essa
 *  e segue as outras. */
export async function removerFotosDoStorage(supabase: SupabaseClient, urls: (string | null | undefined)[]): Promise<void> {
  const caminhos = urls
    .filter((u): u is string => !!u)
    .map((url) => {
      const marcador = '/patrimonio-fotos/';
      const i = url.indexOf(marcador);
      if (i === -1) return null;
      try {
        return decodeURIComponent(url.slice(i + marcador.length));
      } catch {
        return url.slice(i + marcador.length);
      }
    })
    .filter((c): c is string => !!c);

  if (!caminhos.length) return;
  try {
    await supabase.storage.from('patrimonio-fotos').remove(caminhos);
  } catch {
    /* melhor esforço — a exclusão do registro já aconteceu, não trava por isso */
  }
}
