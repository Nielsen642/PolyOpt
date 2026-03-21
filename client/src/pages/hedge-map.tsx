import { useEffect, useMemo, useState } from "react";
import { Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCorrelations } from "@/hooks/use-correlations";
import { useDashboard, usePortfolioDetails } from "@/hooks/use-portfolios";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { useLocation } from "wouter";

function truncateId(id: string, start = 8, end = 6): string {
  if (!id || id.length <= start + end + 1) return id;
  return `${id.slice(0, start)}…${id.slice(-end)}`;
}

export default function HedgeMapPage() {
  const [location] = useLocation();
  const { data: dashboard } = useDashboard();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const activePortfolioId = selectedPortfolioId ?? dashboard?.portfolios[0]?.portfolio.id ?? 0;
  const { data: detail } = usePortfolioDetails(activePortfolioId, !!activePortfolioId);
  const { data: correlations } = useCorrelations();
  const [edgeThreshold, setEdgeThreshold] = useState(0.2);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
   const [showOnlySelectedEdges, setShowOnlySelectedEdges] = useState(false);

  const requestedMarketId = useMemo(() => {
    if (!location) return null;
    const parts = location.split("?");
    if (parts.length < 2) return null;
    const params = new URLSearchParams(parts[1]);
    const mid = params.get("marketId");
    return mid && mid.length > 0 ? mid : null;
  }, [location]);

  const nodes = useMemo(() => {
    if (!detail) return [];
    return detail.positions.map((position, index) => {
      const angle = (index / Math.max(detail.positions.length, 1)) * Math.PI * 2;
      const radius = 170;
      return {
        ...position,
        x: 220 + Math.cos(angle) * radius,
        y: 220 + Math.sin(angle) * radius,
        size: 20 + position.allocationWeight * 70,
      };
    });
  }, [detail]);

  const edges = useMemo(() => {
    if (!correlations) return [];
    const matrixIndex = new Map(correlations.markets.map((market, index) => [market.id, index]));
    const result: Array<{ from: string; to: string; value: number }> = [];

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const left = matrixIndex.get(nodes[i].marketId);
        const right = matrixIndex.get(nodes[j].marketId);
        if (left === undefined || right === undefined) continue;

        const value = correlations.matrix[left]?.[right] ?? 0;
        if (Math.abs(value) < edgeThreshold) continue;
        if (
          showOnlySelectedEdges &&
          selectedMarketId &&
          nodes[i].marketId !== selectedMarketId &&
          nodes[j].marketId !== selectedMarketId
        ) {
          continue;
        }
        result.push({ from: nodes[i].marketId, to: nodes[j].marketId, value });
      }
    }

    return result;
  }, [correlations, nodes, edgeThreshold, showOnlySelectedEdges, selectedMarketId]);

  const degrees = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodes) {
      map.set(node.marketId, 0);
    }
    for (const edge of edges) {
      map.set(edge.from, (map.get(edge.from) ?? 0) + 1);
      map.set(edge.to, (map.get(edge.to) ?? 0) + 1);
    }
    return map;
  }, [nodes, edges]);

  const rankedNodes = useMemo(
    () =>
      [...nodes]
        .map((n) => ({
          ...n,
          degree: degrees.get(n.marketId) ?? 0,
        }))
        .sort((a, b) => {
          // Primary: allocation weight desc, secondary: degree desc
          if (b.allocationWeight !== a.allocationWeight) {
            return b.allocationWeight - a.allocationWeight;
          }
          return (b.degree ?? 0) - (a.degree ?? 0);
        }),
    [nodes, degrees],
  );

  const selectedNode = nodes.find((node) => node.marketId === selectedMarketId) ?? nodes[0];

  useEffect(() => {
    if (!requestedMarketId) return;
    const exists = nodes.some((n: any) => n.marketId === requestedMarketId);
    if (exists) {
      setSelectedMarketId(requestedMarketId);
    }
  }, [nodes, requestedMarketId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
            <Network className="h-8 w-8 text-primary" />
            Hedge Map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Exposure graph driven by backend portfolio analytics and the correlation matrix.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {dashboard?.portfolios.map((item) => (
            <Button
              key={item.portfolio.id}
              variant={item.portfolio.id === activePortfolioId ? "default" : "outline"}
              onClick={() => setSelectedPortfolioId(item.portfolio.id)}
            >
              {item.portfolio.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Correlation Graph</CardTitle>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Edge threshold</span>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={edgeThreshold}
                    onChange={(e) =>
                      setEdgeThreshold(Math.min(1, Math.max(0, Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)))
                    }
                    className="w-20"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEdgeThreshold(0.1)}
                  >
                    Low
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEdgeThreshold(0.3)}
                  >
                    Med
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEdgeThreshold(0.6)}
                  >
                    High
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto space-y-4">
            <svg viewBox="0 0 440 440" className="mx-auto h-[440px] w-full max-w-[440px]">
              {edges.map((edge) => {
                const from = nodes.find((node) => node.marketId === edge.from);
                const to = nodes.find((node) => node.marketId === edge.to);
                if (!from || !to) return null;

                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={edge.value > 0 ? "#3b82f6" : "#ef4444"}
                    strokeOpacity={0.4 + Math.abs(edge.value) * 0.4}
                    strokeWidth={1 + Math.abs(edge.value) * 4}
                  />
                );
              })}

              {nodes.map((node) => (
                <g
                  key={node.marketId}
                  onClick={() => setSelectedMarketId(node.marketId)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.size / 2}
                    fill={node.netExposure >= 0 ? "#10b981" : "#ef4444"}
                    fillOpacity={selectedNode?.marketId === node.marketId ? 0.95 : 0.75}
                    stroke={selectedNode?.marketId === node.marketId ? "#ffffff" : "transparent"}
                    strokeWidth={2}
                  />
                  <text
                    x={node.x}
                    y={node.y + 4}
                    fill="#ffffff"
                    fontSize="11"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {truncateId(node.marketId)}
                  </text>
                </g>
              ))}
            </svg>

            <div className="flex flex-col gap-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-foreground text-xs">Legend</span>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded bg-[#3b82f6]" />
                  <span>Positive linkage</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded bg-[#ef4444]" />
                  <span>Negative linkage</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-[1px] w-6 rounded bg-border" />
                  <span>0.1 – 0.3</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-[2px] w-6 rounded bg-border" />
                  <span>0.3 – 0.6</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-[3px] w-6 rounded bg-border" />
                  <span>&gt; 0.6</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-border bg-background"
                    checked={showOnlySelectedEdges}
                    onChange={(e) => setShowOnlySelectedEdges(e.target.checked)}
                  />
                  <span>Show edges for selected node only</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>Selected Node & Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="text-base font-semibold text-foreground truncate" title={selectedNode.question}>
                    {selectedNode.question}
                  </div>
                  <div className="font-mono-data text-xs text-muted-foreground truncate" title={selectedNode.marketId}>
                    {truncateId(selectedNode.marketId, 10, 8)}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <NodeMetric label="Current Value" value={formatCurrency(selectedNode.currentValue)} />
                  <NodeMetric label="Net Exposure" value={formatSignedCurrency(selectedNode.netExposure)} />
                  <NodeMetric label="PnL" value={formatSignedCurrency(selectedNode.pnl)} />
                  <NodeMetric label="Allocation Weight" value={formatPercent(selectedNode.allocationWeight)} />
                  <NodeMetric
                    label="Suggested Hedge Side"
                    value={selectedNode.netExposure >= 0 ? "BUY NO" : "BUY YES"}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Node rankings (by allocation & degree)
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border/40 bg-black/20 p-2 space-y-1">
                    {rankedNodes.map((node) => (
                      <button
                        key={node.marketId}
                        type="button"
                        onClick={() => setSelectedMarketId(node.marketId)}
                        className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left text-xs transition hover:bg-white/5 ${
                          node.marketId === selectedNode.marketId ? "bg-white/10" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-foreground" title={node.question}>
                            {node.question}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground truncate" title={node.marketId}>
                            {truncateId(node.marketId)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-[11px] text-foreground">
                            {formatPercent(node.allocationWeight)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            deg {degrees.get(node.marketId) ?? 0}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Select a market node to inspect its hedge posture.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NodeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono-data text-sm text-foreground">{value}</div>
    </div>
  );
}
