import { Download, ShieldCheck, Zap, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePwaInstall } from "@/hooks/use-pwa";
import { getIntegrationStatus } from "@/lib/integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IntegrationsPage() {
  const auth = useAuth();
  const { canInstall, install, isInstalled } = usePwaInstall();
  const integrationStatus = getIntegrationStatus();
  const healthQuery = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Health check failed");
      }
      return (await res.json()) as {
        ok: boolean;
        proMode?: boolean;
        nodeEnv?: string;
        uptimeSeconds?: number;
        demoMode: boolean;
        polymarketWalletConfigured: boolean;
        polymarketDataReachable?: boolean;
        polymarketGammaReachable?: boolean;
        polymarketClobReachable?: boolean;
      };
    },
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          <Zap className="h-8 w-8 text-primary" />
          Integrations & Readiness
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Wallet, realtime, installability, and operational readiness controls.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>PWA & Offline Installation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusRow label="Installed" value={isInstalled ? "yes" : "no"} />
            <StatusRow label="Install Prompt Available" value={canInstall ? "yes" : "no"} />
            <Button onClick={() => void install()} disabled={!canInstall}>
              <Download className="mr-2 h-4 w-4" />
              Install App
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusRow
              label="Backend"
              value={
                healthQuery.isLoading
                  ? "checking..."
                  : healthQuery.isError || !healthQuery.data?.ok
                    ? "ERROR"
                    : "OK"
              }
            />
            <StatusRow
              label="App tier"
              value={
                healthQuery.data
                  ? healthQuery.data.proMode
                    ? "Pro (production features on)"
                    : "Standard"
                  : "unknown"
              }
            />
            <StatusRow
              label="Process uptime"
              value={
                healthQuery.data?.uptimeSeconds != null
                  ? `${Math.floor(healthQuery.data.uptimeSeconds / 60)}m`
                  : "unknown"
              }
            />
            <StatusRow
              label="Demo Mode"
              value={
                healthQuery.data
                  ? healthQuery.data.demoMode
                    ? "on"
                    : "off"
                  : "unknown"
              }
            />
            <StatusRow
              label="Polymarket Wallet"
              value={
                healthQuery.data
                  ? healthQuery.data.polymarketWalletConfigured
                    ? "configured"
                    : "missing"
                  : "unknown"
              }
            />
            <StatusRow
              label="Polymarket Data API"
              value={
                healthQuery.data
                  ? healthQuery.data.polymarketDataReachable
                    ? "reachable"
                    : "unreachable"
                  : "unknown"
              }
            />
            <StatusRow
              label="Polymarket Gamma API"
              value={
                healthQuery.data
                  ? healthQuery.data.polymarketGammaReachable
                    ? "reachable"
                    : "unreachable"
                  : "unknown"
              }
            />
            <StatusRow
              label="Polymarket CLOB"
              value={
                healthQuery.data
                  ? healthQuery.data.polymarketClobReachable
                    ? "reachable"
                    : "unreachable"
                  : "unknown"
              }
            />
            <div className="rounded-lg border border-border/50 bg-black/20 p-3 text-xs text-muted-foreground">
              This reflects the local app backend only. Network connectivity to
              Polymarket and the optimizer may still affect live data and hedge runs.
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>Protection & Production Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusRow label="Authenticated Session" value={auth.isAuthenticated ? auth.user?.displayName ?? "active" : "inactive"} />
            <StatusRow label="Backend URL" value={integrationStatus.backendUrl} />
            <div className="rounded-lg border border-border/50 bg-black/20 p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Readiness Checklist</div>
              <ul className="mt-2 space-y-2">
                <li>Protected routes are active.</li>
                <li>PWA install and offline cache are enabled.</li>
                <li>Browser notifications are configurable.</li>
                <li>Wallet and Supabase integrations are env-driven and ready for credentials.</li>
              </ul>
            </div>
            <Button variant="outline" onClick={() => void auth.logout()} disabled={!auth.isAuthenticated || auth.logoutPending}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {auth.logoutPending ? "Signing out..." : "Sign Out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-black/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-data text-foreground">{value}</span>
    </div>
  );
}
