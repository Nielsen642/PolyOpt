import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationStatus } from "@/lib/integrations";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getIntegrationStatus();
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return client;
}

export function buildChannel(name: string): any | null {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  return supabase.channel(name);
}
