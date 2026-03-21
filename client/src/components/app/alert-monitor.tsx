import { useCallback, useEffect, useRef } from "react";
import type { MarketSnapshot } from "@shared/schema";
import { useAlerts } from "@/hooks/use-alerts";
import { useAuth } from "@/hooks/use-auth";
import { useMarkets } from "@/hooks/use-markets";
import { useDashboard } from "@/hooks/use-portfolios";
import { useSupabaseAlertFeed } from "@/hooks/use-supabase-realtime";

export function AlertMonitor() {
  const { isAuthenticated } = useAuth();
  const { data: feed } = useMarkets(isAuthenticated);
  /** Avoid `?? []` — a new array every render would retrigger this effect endlessly. */
  const markets = feed?.markets;
  const { data: dashboard } = useDashboard(isAuthenticated);
  const { evaluateAlerts, ingestExternalAlert } = useAlerts();
  const previousMarketsRef = useRef<Record<string, MarketSnapshot | undefined>>({});
  const hasInitializedRef = useRef(false);

  const handleSupabaseAlert = useCallback(
    ({ title, description }: { title: string; description: string }) => {
      ingestExternalAlert(title, description);
    },
    [ingestExternalAlert],
  );

  useSupabaseAlertFeed(handleSupabaseAlert);

  useEffect(() => {
    if (!markets?.length) {
      return;
    }

    if (hasInitializedRef.current) {
      evaluateAlerts({
        markets,
        previousMarkets: previousMarketsRef.current,
        portfolioSummary: dashboard?.portfolios[0]?.summary,
      });
    } else {
      hasInitializedRef.current = true;
    }

    previousMarketsRef.current = Object.fromEntries(markets.map((market) => [market.id, market]));
  }, [dashboard?.portfolios, evaluateAlerts, markets]);

  return null;
}
