export function getIntegrationStatus() {
  return {
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    backendUrl: import.meta.env.VITE_BACKEND_URL || window.location.origin,
  };
}
