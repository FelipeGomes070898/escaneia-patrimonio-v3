import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Cliente do Supabase com a chave "service_role" — só pode ser usado
 *  dentro de Route Handlers (código que roda no servidor), NUNCA em
 *  Client Components. Essa chave ignora todas as regras de segurança
 *  (RLS), então ela não pode vazar pro navegador — por isso não tem o
 *  prefixo NEXT_PUBLIC_ na variável de ambiente. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
