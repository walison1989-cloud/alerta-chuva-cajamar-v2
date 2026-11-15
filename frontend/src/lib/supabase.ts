import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '@/config/env'

let client: SupabaseClient | null = null

/**
 * Retorna o cliente público do Supabase ou null enquanto as variáveis de
 * ambiente não estiverem configuradas.
 *
 * A chave usada aqui é sempre a chave pública (anon/publishable). Nunca
 * coloque a service_role no frontend: ela ignora RLS.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }

  return client
}
