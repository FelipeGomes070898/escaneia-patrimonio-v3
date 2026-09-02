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
