"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

let client: SupabaseClient<Database> | null = null;

/** Cliente Supabase do browser (singleton). Usa apenas a chave pública. */
export function getBrowserSupabase(): SupabaseClient<Database> {
  if (!client) {
    client = createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
  }
  return client;
}
