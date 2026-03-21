import { useEffect, useState } from "react";
import type { MarketSnapshot } from "@shared/schema";
import { buildChannel, getSupabaseClient } from "@/lib/supabase";

type SupabaseMarketOverlay = Record<
  string,
  {
    currentPrice: number;
    yesPrice: number;
    noPrice: number;
    openInterest: number;
    direction?: "up" | "down" | "none";
  }
>;

const MARKET_CHANNEL = import.meta.env.VITE_SUPABASE_MARKETS_CHANNEL || "polyopt:markets";
const ALERT_CHANNEL = import.meta.env.VITE_SUPABASE_ALERTS_CHANNEL || "polyopt:alerts";

export function useSupabaseMarketFeed(marketIds: string[]) {
  const [prices, setPrices] = useState<SupabaseMarketOverlay>({});
  const [isConnected, setIsConnected] = useState(false);
  const supabase = getSupabaseClient();
  const marketKey = JSON.stringify(marketIds);

  useEffect(() => {
    if (!supabase || marketIds.length === 0) {
      setIsConnected(false);
      return;
    }

    const channel = buildChannel(MARKET_CHANNEL);
    if (!channel) {
      return;
    }

    channel
      .on("broadcast", { event: "market_snapshot" }, ({ payload }: { payload: unknown }) => {
        const market = payload as MarketSnapshot;
        if (!marketIds.includes(market.id)) {
          return;
        }

        setPrices((current) => {
          const previous = current[market.id];
          const direction =
            !previous || market.currentPrice === previous.currentPrice
              ? "none"
              : market.currentPrice > previous.currentPrice
                ? "up"
                : "down";

          return {
            ...current,
            [market.id]: {
              currentPrice: market.currentPrice,
              yesPrice: market.yesPrice,
              noPrice: market.noPrice,
              openInterest: market.openInterest,
              direction,
            },
          };
        });
      })
      .subscribe((status: string) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [marketKey, supabase]);

  return { prices, isConnected, configured: !!supabase };
}

export function useSupabaseAlertFeed(onAlert: (event: { title: string; description: string }) => void) {
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = buildChannel(ALERT_CHANNEL);
    if (!channel) {
      return;
    }

    channel
      .on("broadcast", { event: "alert_event" }, ({ payload }: { payload: unknown }) => {
        const data = payload as { title: string; description: string };
        onAlert(data);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onAlert, supabase]);
}
