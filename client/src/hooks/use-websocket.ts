import { useEffect, useRef, useState } from "react";
import { ws } from "@shared/routes";

interface LiveMarketData {
  currentPrice: number;
  yesPrice: number;
  noPrice: number;
  openInterest: number;
  direction?: "up" | "down" | "none";
}

export function useMarketPrices(marketIds: string[]) {
  const [prices, setPrices] = useState<Record<string, LiveMarketData>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Deep comparison of array to prevent infinite re-renders
  const marketIdsJson = JSON.stringify(marketIds);

  useEffect(() => {
    if (marketIds.length === 0) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}/ws`;
    
    wsRef.current = new WebSocket(socketUrl);

    wsRef.current.onopen = () => {
      wsRef.current?.send(
        JSON.stringify({
          type: "subscribe",
          payload: { market_ids: marketIds },
        })
      );
    };

    wsRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "market_snapshot") {
          const payload = ws.receive.market_snapshot.parse(data.payload);
          
          setPrices((prev) => {
            const oldPrice = prev[payload.id]?.currentPrice ?? payload.currentPrice;
            const newPrice = payload.currentPrice;
            let direction: "up" | "down" | "none" = "none";
            
            if (newPrice > oldPrice) direction = "up";
            else if (newPrice < oldPrice) direction = "down";

            return {
              ...prev,
              [payload.id]: {
                currentPrice: payload.currentPrice,
                yesPrice: payload.yesPrice,
                noPrice: payload.noPrice,
                openInterest: payload.openInterest,
                direction,
              },
            };
          });
        }
      } catch (err) {
        console.error("WS parsing error", err);
      }
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [marketIdsJson]);

  return prices;
}

export function useMarketPricesWhenEnabled(marketIds: string[], enabled: boolean) {
  return useMarketPrices(enabled ? marketIds : []);
}
