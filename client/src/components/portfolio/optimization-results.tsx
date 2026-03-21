import { useEffect, useMemo, useState } from "react";
import type { OptimizationResponse } from "@shared/schema";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { buildLimitOrder, signOrderWithWalletClient, submitOrderRelay } from "@/lib/polymarket-orders";
import { useWallet } from "@/hooks/use-wallet";

type LifecycleStatus = "idle" | "submitted" | "partial" | "filled" | "cancelled" | "failed";

export function OptimizationResults({ result }: { result: OptimizationResponse }) {
  const { walletAddress, walletClient } = useWallet();
  const [statuses, setStatuses] = useState<Record<string, LifecycleStatus>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState({
    POLY_API_KEY: "",
    POLY_ADDRESS: "",
    POLY_SIGNATURE: "",
    POLY_PASSPHRASE: "",
    POLY_TIMESTAMP: "",
  });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [serverClobRelay, setServerClobRelay] = useState(false);

  useEffect(() => {
    void fetch("/api/pro/meta", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { features?: { serverClobRelay?: boolean } } | null) =>
        setServerClobRelay(Boolean(m?.features?.serverClobRelay)),
      )
      .catch(() => setServerClobRelay(false));
  }, []);

  const chartData = result.trades.map((trade) => ({
    name: trade.marketId.slice(0, 8),
    amount: trade.amount,
  }));

  const cvarDelta = result.metrics.cvarBefore - result.metrics.cvarAfter;
  const stressDelta = result.metrics.stressLossBefore - result.metrics.stressLossAfter;

  const rationale = useMemo(() => {
    const bits: string[] = [];
    if (cvarDelta > 0) bits.push(`tail-risk improves by ${formatCurrency(cvarDelta)}`);
    if (stressDelta > 0) bits.push(`stress-loss improves by ${formatCurrency(stressDelta)}`);
    if (result.metrics.budgetUsed > 0) bits.push(`budget used is ${formatCurrency(result.metrics.budgetUsed)}`);
    return bits.length > 0 ? bits.join(", ") : "no significant risk transition detected";
  }, [cvarDelta, stressDelta, result.metrics.budgetUsed]);

  const estimateSlippagePct = (amount: number) => {
    // Simple proxy until a full depth simulator is wired.
    const sizeFactor = Math.min(0.02, amount / 1_000_000);
    return 0.001 + sizeFactor;
  };

  const estimateFee = (amount: number) => amount * 0.003;
  const estimateFillPct = (amount: number) => Math.max(0.6, Math.min(0.99, 1 - amount / 2_000_000));

  async function placeOrder(trade: OptimizationResponse["trades"][number]) {
    const key = `${trade.marketId}-${trade.tradeType}`;
    if (!walletAddress || !walletClient) {
      setStatuses((s) => ({ ...s, [key]: "failed" }));
      setMessages((m) => ({ ...m, [key]: "Connect wallet first." }));
      return;
    }
    setSubmitting(key);
    setStatuses((s) => ({ ...s, [key]: "submitted" }));
    setMessages((m) => ({ ...m, [key]: "Submitting..." }));

    try {
      const tokenMapRes = await fetch(`/api/polymarket/tokens?conditionIds=${encodeURIComponent(trade.marketId)}`, {
        credentials: "include",
      });
      const tokenMap = (await tokenMapRes.json()) as Record<string, { yesTokenId: string; noTokenId: string }>;
      const tokenInfo = tokenMap[trade.marketId];
      const tokenId = trade.tradeType === "buy_yes" ? tokenInfo?.yesTokenId : tokenInfo?.noTokenId;
      if (!tokenId) {
        setStatuses((s) => ({ ...s, [key]: "failed" }));
        setMessages((m) => ({ ...m, [key]: "Token resolution failed." }));
        return;
      }

      const side = "BUY";
      const unsigned = buildLimitOrder(tokenId, side, trade.estimatedShares, trade.entryPrice, walletAddress);
      const signed = await signOrderWithWalletClient(unsigned, walletClient as any);
      const relay = await submitOrderRelay(
        {
          order: signed,
          owner: walletAddress,
          orderType: "GTC",
        },
        serverClobRelay ? {} : headers,
      );

      const relayStatus = String(relay.status || "").toLowerCase();
      if (relay.success || relayStatus.includes("filled")) {
        setStatuses((s) => ({ ...s, [key]: "filled" }));
        setMessages((m) => ({ ...m, [key]: relay.orderID ? `Filled (${relay.orderID})` : "Filled" }));
      } else if (relayStatus.includes("partial")) {
        setStatuses((s) => ({ ...s, [key]: "partial" }));
        setMessages((m) => ({ ...m, [key]: "Partially filled" }));
      } else {
        setStatuses((s) => ({ ...s, [key]: "failed" }));
        setMessages((m) => ({ ...m, [key]: relay.errorMsg || "Order failed" }));
      }
    } catch (e) {
      setStatuses((s) => ({ ...s, [key]: "failed" }));
      setMessages((m) => ({ ...m, [key]: e instanceof Error ? e.message : "Order failed" }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CVaR Improvement" value={formatSignedCurrency(result.metrics.cvarBefore - result.metrics.cvarAfter)} />
        <MetricCard label="Stress Loss Improvement" value={formatSignedCurrency(result.metrics.stressLossBefore - result.metrics.stressLossAfter)} />
        <MetricCard label="Expected Scenario Return" value={formatSignedCurrency(result.metrics.expectedReturnAfter)} />
        <MetricCard label="Budget Used" value={formatCurrency(result.metrics.budgetUsed)} />
      </div>

      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle>Recommended Hedge Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {serverClobRelay ? (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-emerald-400/90 mb-1">Pro execution</div>
              CLOB L2 headers are injected on the server from environment variables (
              <span className="font-mono">POLY_*</span>). Do not paste API secrets in the browser.
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-border/50 bg-black/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">Pre-trade auth headers (sandbox)</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {Object.entries(headers).map(([k, v]) => (
                  <Input
                    key={k}
                    value={v}
                    placeholder={k}
                    onChange={(e) => setHeaders((h) => ({ ...h, [k]: e.target.value }))}
                    className="h-8 bg-black/40 font-mono-data text-xs"
                  />
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border/50 bg-black/20">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>Market</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Pre-Trade Checks</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Expected Return</TableHead>
                  <TableHead className="text-right">Protection</TableHead>
                  <TableHead className="text-right">Lifecycle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.trades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      No additional hedge trades are needed under the current scenario set.
                    </TableCell>
                  </TableRow>
                ) : (
                  result.trades.map((trade) => (
                    <TableRow key={`${trade.marketId}-${trade.tradeType}`} className="border-border/50 text-sm">
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {trade.polymarketUrl ? (
                            <a
                              href={trade.polymarketUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              {trade.question}
                            </a>
                          ) : (
                            trade.question
                          )}
                        </div>
                        <div className="font-mono-data text-xs text-muted-foreground">{trade.marketId}</div>
                      </TableCell>
                      <TableCell className={trade.tradeType === "buy_yes" ? "text-emerald-400" : "text-red-400"}>
                        {trade.tradeType.replace("_", " ").toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>slippage est: {(estimateSlippagePct(trade.amount) * 100).toFixed(2)}%</div>
                          <div>fee est: {formatCurrency(estimateFee(trade.amount))}</div>
                          <div>expected fill: {(estimateFillPct(trade.amount) * 100).toFixed(1)}%</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono-data">{formatCurrency(trade.amount)}</TableCell>
                      <TableCell className="text-right font-mono-data">{formatPercent(trade.entryPrice)}</TableCell>
                      <TableCell className="text-right font-mono-data">{formatSignedCurrency(trade.expectedScenarioReturn)}</TableCell>
                      <TableCell className="text-right font-mono-data">{formatCurrency(trade.worstCaseProtection)}</TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <div className="text-xs font-mono-data">{statuses[`${trade.marketId}-${trade.tradeType}`] ?? "idle"}</div>
                          {messages[`${trade.marketId}-${trade.tradeType}`] ? (
                            <div className="text-[10px] text-muted-foreground">{messages[`${trade.marketId}-${trade.tradeType}`]}</div>
                          ) : null}
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={submitting === `${trade.marketId}-${trade.tradeType}`}
                              onClick={() => void placeOrder(trade)}
                            >
                              Place
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setStatuses((s) => ({ ...s, [`${trade.marketId}-${trade.tradeType}`]: "cancelled" }))
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>Hedge Allocation</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" />
                <YAxis stroke="#71717a" tickFormatter={(value) => formatCurrency(Number(value))} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Risk Transition</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetricCard
            label="CVaR"
            value={`${formatSignedCurrency(result.metrics.cvarBefore)} → ${formatSignedCurrency(result.metrics.cvarAfter)}`}
          />
          <MetricCard
            label="Stress Loss"
            value={`${formatSignedCurrency(result.metrics.stressLossBefore)} → ${formatSignedCurrency(result.metrics.stressLossAfter)}`}
          />
          <MetricCard
            label="Plain-language rationale"
            value={rationale}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/50 bg-black/30">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono-data text-lg text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
