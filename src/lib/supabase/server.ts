import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Cliente do Supabase para uso no servidor (Server Components, Route
 *  Handlers, Server Actions) — lê/escreve a sessão via cookies. */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // chamado de um Server Component — ok ignorar, o middleware
            // já cuida de renovar a sessão
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // idem
          }
        }
      }
    }
  );
}
