import type { WebSocket } from "ws";
import type { MarketSnapshot } from "@shared/schema";
import {
  fetchUserPositions,
  fetchMarketsForPositions,
  fetchOrderBooks,
  getTokenIdsFromPositions,
  normalizePolymarketPositions,
  normalizePolymarketMarkets,
} from "./polymarket";

const POLL_INTERVAL_MS = 5000;
const CLOB_API_BASE = "https://clob.polymarket.com";

export type GetStateFn = (userId: number) => Promise<{
  markets: MarketSnapshot[];
  positions: unknown[];
  portfolios: unknown[];
}>;

export type SubscriptionMap = Map<
  WebSocket,
  { userId: number; marketIds: string[] }
>;

/**
 * Start a polling loop that re-fetches Polymarket data and pushes
 * market_snapshot messages to subscribed WebSocket clients.
 * All data comes from Polymarket production APIs (positions + CLOB).
 */
export function startPolymarketPoller(
  getState: GetStateFn,
  subscriptions: SubscriptionMap,
): () => void {
  const interval = setInterval(async () => {
    subscriptions.forEach(async (sub, ws) => {
      if (ws.readyState !== 1 /* OPEN */) return;
      try {
        const state = await getState(sub.userId);
        const markets =
          sub.marketIds.length > 0
            ? state.markets.filter((m) => sub.marketIds.includes(m.id))
            : state.markets;
        for (const market of markets) {
          ws.send(
            JSON.stringify({
              type: "market_snapshot",
              payload: market,
            }),
          );
        }
      } catch (err) {
        console.error("Polymarket stream poll error:", err);
      }
    });
  }, POLL_INTERVAL_MS);

  return () => clearInterval(interval);
}
