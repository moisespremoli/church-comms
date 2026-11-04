import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MissingEnvError, supabaseUrl } from "@/lib/env";

/**
 * Cliente com a chave secreta (ignora RLS). Usar SÓ em código de servidor
 * já autorizado (ex.: Server Actions de administração depois de requireAdmin()).
 */
export function getAdminSupabase() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new MissingEnvError("SUPABASE_SECRET_KEY");

  return createClient<Database>(supabaseUrl(), secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
