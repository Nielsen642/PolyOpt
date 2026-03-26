import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ScanCategory = "crypto" | "sports" | "politics";

interface ScannedMarket {
  id: string;
  title: string;
  conditionId: string;
  clobTokenIds: string[];
  outcomes: string[];
  outcomePrices: number[];
  volume24hr: number;
  slug?: string;
}

function useMarketScan(category: ScanCategory) {
  return useQuery({
    queryKey: ["market-scan", category],
    queryFn: async () => {
      const res = await fetch(`/api/market-scan/${category}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load market scan");
      }
      return (await res.json()) as ScannedMarket[];
    },
  });
}

export default function MarketScanPage() {
  const [category, setCategory] = useState<ScanCategory>("crypto");
  const { data, isLoading, isError } = useMarketScan(category);

  const categories: { id: ScanCategory; label: string }[] = [
    { id: "crypto", label: "Crypto" },
    { id: "sports", label: "Sports" },
    { id: "politics", label: "Politics" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Market Scan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            High-activity Polymarket markets by category, sourced from Gamma API.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border/50 bg-black/40 p-1">
          {categories.map((c) => (
            <Button
              key={c.id}
              variant={category === c.id ? "default" : "ghost"}
              size="sm"
              className="rounded-md"
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card
              key={idx}
              className="glass-panel h-40 animate-pulse border-border/30 bg-card/20"
            />
          ))}
        </div>
      ) : isError ? (
        <Card className="glass-panel border-destructive/40 bg-destructive/10">
          <CardContent className="py-6 text-sm text-destructive-foreground">
            Failed to load market scan for this category. Please try again.
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="py-6 text-sm text-muted-foreground">
            No active markets found for this category. Try another segment or
            check back later.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((m) => (
            <Card
              key={m.id}
              className="glass-panel border-border/50 bg-black/40 hover:border-primary/40 transition-colors"
            >
              <CardHeader>
                <CardTitle className="line-clamp-2 text-base leading-snug">
                  {m.title}
                </CardTitle>
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="max-w-[60%] truncate font-mono-data text-xs"
                    title={m.conditionId}
                  >
                    {m.conditionId.slice(0, 10)}…
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {category.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Outcomes
                  </div>
                  <div className="mt-1 space-y-1 font-mono-data">
                    {!Array.isArray(m.outcomes) || m.outcomes.length === 0 ? (
                      <div className="text-muted-foreground/80">
                        No outcome metadata
                      </div>
                    ) : (
                      m.outcomes.map((o, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span>{o}</span>
                          {m.outcomePrices[idx] !== undefined && (
                            <span className="text-muted-foreground">
                              {(m.outcomePrices[idx] * 100).toFixed(2)}%
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    CLOB Tokens
                  </div>
                  <div className="mt-1 space-y-1 font-mono-data text-xs text-muted-foreground">
                  {!Array.isArray(m.clobTokenIds) || m.clobTokenIds.length === 0
                    ? "n/a"
                    : m.clobTokenIds.map((tid) => (
                        <div key={tid} className="truncate" title={tid}>
                          {tid}
                        </div>
                      ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    24h Volume:{" "}
                    <span className="font-mono-data text-foreground">
                      ${m.volume24hr.toFixed(2)}
                    </span>
                  </span>
                  {m.slug && (
                    <a
                      href={`https://polymarket.com/event/${m.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      Open market
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

