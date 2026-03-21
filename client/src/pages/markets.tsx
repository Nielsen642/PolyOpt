import { useMarkets } from "@/hooks/use-markets";
import { useMarketPricesWhenEnabled } from "@/hooks/use-websocket";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Signal, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { MarketCard } from "@/components/markets/market-card";
import { useSupabaseMarketFeed } from "@/hooks/use-supabase-realtime";
import { useQuery } from "@tanstack/react-query";

export default function Markets() {
  const { data: feed, dataUpdatedAt, isLoading, isError } = useMarkets();
  const markets = feed?.markets ?? [];
  const feedMeta = feed?.meta;
  const diagnostics = useQuery({
    queryKey: ["/api/health", "markets-page"],
    queryFn: async () => {
      const r = await fetch("/api/health", { credentials: "include" });
      if (!r.ok) throw new Error("health failed");
      return (await r.json()) as any;
    },
    retry: false,
    refetchInterval: 60000,
  });
  
  // Extract market IDs for WebSocket subscription
  const marketIds = markets?.map(m => m.id) || [];
  
  // Realtime WS prices overlay
  const supabaseFeed = useSupabaseMarketFeed(marketIds);
  const livePrices = useMarketPricesWhenEnabled(marketIds, !supabaseFeed.isConnected);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Live Markets</h1>
          <p className="text-muted-foreground mt-1">Connecting to global order book...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="glass-panel border-border/30 h-48 animate-pulse bg-card/20" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h3 className="text-xl font-bold">Failed to load market data</h3>
        <p className="text-muted-foreground">The API endpoint might not be fully implemented yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            Market Analytics
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </h1>
          <p className="text-muted-foreground mt-1 font-mono-data text-sm flex items-center gap-2">
            <Signal className="w-4 h-4" /> {supabaseFeed.isConnected
              ? "Supabase realtime subscribed"
              : supabaseFeed.configured
                ? "Supabase standby, backend WebSocket fallback active"
                : "Backend WebSocket realtime active"}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-black/20 p-3 text-xs text-muted-foreground space-y-1">
          <div>Data: {diagnostics.data?.polymarketDataReachable ? "ok" : "down"}</div>
          <div>Gamma: {diagnostics.data?.polymarketGammaReachable ? "ok" : "down"}</div>
          <div>CLOB: {diagnostics.data?.polymarketClobReachable ? "ok" : "down"}</div>
          {feedMeta ? (
            <>
              <div className="pt-1 border-t border-border/40 mt-1">
                Feed assembled: {new Date(feedMeta.assembledAt).toLocaleString()} · wallet{" "}
                {feedMeta.dataWalletFingerprint ?? "—"}
              </div>
              <div>
                Lineage: Data {feedMeta.sources.dataApi} · Gamma {feedMeta.sources.gamma} · CLOB{" "}
                {feedMeta.sources.clob}
              </div>
              {feedMeta.proMode ? (
                <div className="text-emerald-400/90">Pro feed contract — use for production analysis.</div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {feedMeta?.sources.dataApi === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Polymarket Data API error — no live positions. Verify <code className="font-mono">POLYMARKET_WALLET_ADDRESS</code>{" "}
          and outbound network from the server.
        </div>
      ) : null}
      {dataUpdatedAt &&
      feedMeta &&
      Date.now() - dataUpdatedAt > feedMeta.staleWarningAfterMs ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Client has not refreshed market data in {Math.round(feedMeta.staleWarningAfterMs / 60000)}+ minutes.
          Check connectivity or pull to refresh.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {markets?.map((market, idx) => {
          const liveData = supabaseFeed.prices[market.id] ?? livePrices[market.id];

          return (
            <motion.div
              key={market.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <MarketCard market={market} liveData={liveData} />
            </motion.div>
          );
        })}

        {markets?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed border-border/50 rounded-xl bg-black/20">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No active markets found</p>
          </div>
        )}
      </div>
    </div>
  );
}
