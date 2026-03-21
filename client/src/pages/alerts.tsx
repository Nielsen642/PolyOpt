import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { useAlerts, type AlertDeliveryChannels, type AlertRule, type AlertRuleType, type AlertSeverity } from "@/hooks/use-alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useMarkets } from "@/hooks/use-markets";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { proApi } from "@/lib/api";

function ruleTypeLabel(type: AlertRuleType) {
  if (type === "price_move") return "Market Price Move";
  if (type === "time_window_move") return "Time-Windowed Move";
  if (type === "exposure_limit") return "Exposure Threshold";
  if (type === "market_drawdown") return "Market Drawdown";
  if (type === "portfolio_drawdown") return "Portfolio Drawdown";
  return "Liquidity / OI Drop";
}

function ruleDescription(rule: AlertRule) {
  if (rule.type === "price_move") return `Market ${rule.marketId ?? "-"} moved > ${(rule.threshold * 100).toFixed(2)}%`;
  if (rule.type === "time_window_move") return `Move > ${(rule.threshold * 100).toFixed(2)}% in ${rule.timeWindowMinutes}m`;
  if (rule.type === "exposure_limit") return `|Net exposure| > ${rule.threshold.toFixed(2)} USD`;
  if (rule.type === "market_drawdown") return `Drawdown > ${(rule.threshold * 100).toFixed(2)}% in ${rule.timeWindowMinutes}m`;
  if (rule.type === "portfolio_drawdown") return `Portfolio drawdown > ${(rule.threshold * 100).toFixed(2)}% in ${rule.timeWindowMinutes}m`;
  return `OI drop > ${(rule.threshold * 100).toFixed(2)}% in ${rule.timeWindowMinutes}m`;
}

function severityVariant(severity: AlertSeverity): "secondary" | "default" | "destructive" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "default";
  return "secondary";
}

function assetClassLabel(assetClass: "crypto" | "sports" | "politics" | "other") {
  if (assetClass === "crypto") return "Crypto";
  if (assetClass === "sports") return "Sports";
  if (assetClass === "politics") return "Politics";
  return "Other";
}

function getDefaultRuleLabel(args: {
  type: AlertRuleType;
  market: { id: string; question: string } | null;
  threshold: number;
  timeWindowMinutes: number;
}) {
  const { type, market, threshold, timeWindowMinutes } = args;
  const q = market?.question ?? "Selected market";

  const pct = (threshold * 100).toFixed(2);
  if (type === "price_move") {
    return `${q} price move > ${pct}% (snapshot-to-snapshot)`;
  }
  if (type === "time_window_move") {
    return `${q} moved > ${pct}% in the last ${timeWindowMinutes}m`;
  }
  if (type === "market_drawdown") {
    return `${q} drawdown > ${pct}% in the last ${timeWindowMinutes}m`;
  }
  if (type === "liquidity_drop") {
    return `${q} open interest dropped > ${pct}% in the last ${timeWindowMinutes}m`;
  }
  return "";
}

export default function AlertsPage() {
  const {
    rules,
    events,
    notificationPermission,
    addRule,
    removeRule,
    setRuleEnabled,
    requestPermission,
    getRuleDiagnostics,
  } = useAlerts();

  const auth = useAuth();
  const { data: marketsFeed } = useMarkets(auth.isAuthenticated);
  const markets = marketsFeed?.markets;
  const [location] = useLocation();
  const { data: proMeta } = useQuery({
    queryKey: ["/api/pro/meta", "alerts-page"],
    queryFn: () => proApi.getMeta(),
    staleTime: 60_000,
  });

  const [type, setType] = useState<AlertRuleType>("price_move");
  const [marketId, setMarketId] = useState("0x123");
  const [threshold, setThreshold] = useState("0.05");
  const [label, setLabel] = useState("Price move alert");
  const [labelTouched, setLabelTouched] = useState(false);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState("30");
  const [cooldownMinutes, setCooldownMinutes] = useState("60");
  const [tagChoice, setTagChoice] = useState<string>("risk");
  const [customTag, setCustomTag] = useState<string>("");
  const [assetClass, setAssetClass] = useState<"crypto" | "sports" | "politics" | "other">("crypto");
  const [severity, setSeverity] = useState<AlertSeverity>("warning");
  const [channels, setChannels] = useState<AlertDeliveryChannels>({
    inApp: true,
    browser: true,
    email: false,
    webhook: false,
    mobilePush: false,
  });

  const [typeFilter, setTypeFilter] = useState<AlertRuleType | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [assetClassFilter, setAssetClassFilter] = useState<"all" | "crypto" | "sports" | "politics" | "other">("all");
  const [selectedRuleIdForEvents, setSelectedRuleIdForEvents] = useState<string | null>(null);

  const requiresMarketId =
    type === "price_move" || type === "time_window_move" || type === "market_drawdown" || type === "liquidity_drop";
  const usesWindow =
    type === "time_window_move" || type === "market_drawdown" || type === "portfolio_drawdown" || type === "liquidity_drop";

  const thresholdNum = Number(threshold);
  const timeWindowNum = Number(timeWindowMinutes);

  const positionOptions = useMemo(() => {
    if (!markets) return [];
    return (markets ?? []).map((m) => ({
      value: m.id,
      label: m.question || m.id,
    }));
  }, [markets]);

  const selectedMarket = useMemo(() => {
    if (!markets) return null;
    return (markets ?? []).find((m) => m.id === marketId) ?? null;
  }, [markets, marketId]);

  useEffect(() => {
    if (!location) return;
    const parts = location.split("?");
    if (parts.length < 2) return;
    const params = new URLSearchParams(parts[1]);

    const queryType = params.get("type");
    const queryMarketId = params.get("marketId");
    const queryThreshold = params.get("threshold");

    const allowedTypes: AlertRuleType[] = [
      "price_move",
      "time_window_move",
      "exposure_limit",
      "market_drawdown",
      "portfolio_drawdown",
      "liquidity_drop",
    ];

    if (queryType && allowedTypes.includes(queryType as AlertRuleType)) {
      setType(queryType as AlertRuleType);
    }
    if (queryMarketId) {
      setMarketId(queryMarketId);
      setLabelTouched(false);
    }
    if (queryThreshold) {
      const n = Number(queryThreshold);
      if (Number.isFinite(n)) setThreshold(String(n));
    }
  }, [location]);

  useEffect(() => {
    if (!requiresMarketId) return;
    if (positionOptions.length === 0) return;
    const exists = positionOptions.some((o) => o.value === marketId);
    if (exists) return;
    setMarketId(positionOptions[0].value);
    setLabelTouched(false);
  }, [marketId, positionOptions, requiresMarketId]);

  const availableTags = useMemo(() => {
    const base = new Set<string>(["risk", "default", "strategy"]);
    for (const r of rules) {
      if (r.tag) base.add(r.tag);
    }
    return Array.from(base);
  }, [rules]);

  const effectiveTag = tagChoice === "__custom__" ? customTag : tagChoice;

  useEffect(() => {
    if (labelTouched) return;
    if (!requiresMarketId) return;
    const thresholdVal = Number.isFinite(thresholdNum) ? thresholdNum : 0;
    const timeWindowVal = Number.isFinite(timeWindowNum) ? timeWindowNum : 30;
    const nextLabel = getDefaultRuleLabel({
      type,
      market: selectedMarket ? { id: selectedMarket.id, question: selectedMarket.question } : null,
      threshold: thresholdVal,
      timeWindowMinutes: timeWindowVal,
    });
    if (nextLabel) setLabel(nextLabel);
  }, [labelTouched, requiresMarketId, selectedMarket, timeWindowNum, thresholdNum, type]);

  const visibleRules = useMemo(() => {
    let list = rules;
    if (typeFilter !== "all") list = list.filter((rule) => rule.type === typeFilter);
    if (severityFilter !== "all") list = list.filter((rule) => rule.severity === severityFilter);
    if (assetClassFilter !== "all") {
      list = list.filter((rule) => (rule.assetClass ?? "other") === assetClassFilter);
    }
    return [...list].sort((a, b) => {
      const aDiag = getRuleDiagnostics(a.id);
      const bDiag = getRuleDiagnostics(b.id);
      const aT = aDiag.lastFiredAt ? Date.parse(aDiag.lastFiredAt) : 0;
      const bT = bDiag.lastFiredAt ? Date.parse(bDiag.lastFiredAt) : 0;
      return bT - aT;
    });
  }, [assetClassFilter, getRuleDiagnostics, rules, severityFilter, typeFilter]);

  const visibleEvents = useMemo(
    () => (selectedRuleIdForEvents ? events.filter((event) => event.ruleId === selectedRuleIdForEvents) : events),
    [events, selectedRuleIdForEvents],
  );

  const rulesById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          <BellRing className="h-8 w-8 text-primary" />
          Alerts & Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Advanced alert engine: richer rule types, channels, severity, diagnostics, and linked event drilldown.
        </p>
        {proMeta?.proMode ? (
          <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200/90">
            <strong>Pro:</strong> rules and recent events are persisted in PostgreSQL and sync across sessions. Rate limits
            apply to API traffic.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Standard mode: alert state stays in this browser (localStorage). Set <code className="font-mono">APP_TIER=pro</code>{" "}
            on the server for durable storage and production hardening.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle>Create Alert Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "price_move",
                  "time_window_move",
                  "exposure_limit",
                  "market_drawdown",
                  "portfolio_drawdown",
                  "liquidity_drop",
                ] as AlertRuleType[]
              ).map((t) => (
                <Button key={t} variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>
                  {ruleTypeLabel(t)}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-label">Rule Label</Label>
              <Input
                id="rule-label"
                value={label}
                onChange={(event) => {
                  setLabelTouched(true);
                  setLabel(event.target.value);
                }}
              />
            </div>

            {requiresMarketId ? (
              <div className="space-y-2">
                <Label htmlFor="market-id">Market ID</Label>
                <Select
                  value={marketId}
                  onValueChange={(value) => {
                    setMarketId(value);
                    setLabelTouched(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={positionOptions.length === 0 ? "No positions available" : "Select a position"} />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.length === 0 ? (
                      <SelectItem value="__none__">No positions available</SelectItem>
                    ) : (
                      positionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="threshold">
                  {type === "exposure_limit" ? "Threshold (USD)" : "Threshold (decimal, e.g. 0.05 = 5%)"}
                </Label>
                <Input
                  id="threshold"
                  type="number"
                  step="0.01"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooldown-minutes">Cooldown (minutes)</Label>
                <Input
                  id="cooldown-minutes"
                  type="number"
                  min={1}
                  step="1"
                  value={cooldownMinutes}
                  onChange={(event) => setCooldownMinutes(event.target.value)}
                />
              </div>
            </div>

            {usesWindow ? (
              <div className="space-y-2">
                <Label htmlFor="window-minutes">Time Window (minutes)</Label>
                <Input
                  id="window-minutes"
                  type="number"
                  min={1}
                  step="1"
                  value={timeWindowMinutes}
                  onChange={(event) => setTimeWindowMinutes(event.target.value)}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tag">Tag / Group</Label>
                <Select value={tagChoice} onValueChange={(value) => setTagChoice(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom…</SelectItem>
                  </SelectContent>
                </Select>

                {tagChoice === "__custom__" ? (
                  <Input
                    id="tag-custom"
                    value={customTag}
                    onChange={(event) => setCustomTag(event.target.value)}
                    placeholder="Enter a custom tag"
                    className="mt-2"
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Asset Class</Label>
                <div className="flex flex-wrap gap-2">
                  {(["crypto", "sports", "politics", "other"] as const).map((klass) => (
                    <Button key={klass} size="sm" variant={assetClass === klass ? "default" : "outline"} onClick={() => setAssetClass(klass)}>
                      {klass}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Severity</Label>
              <div className="flex flex-wrap gap-2">
                {(["info", "warning", "critical"] as const).map((s) => (
                  <Button key={s} size="sm" variant={severity === s ? "default" : "outline"} onClick={() => setSeverity(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Delivery Channels</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ["inApp", "In-app toast"],
                    ["browser", "Browser notification"],
                    ["email", "Email (future)"],
                    ["webhook", "Webhook (future)"],
                    ["mobilePush", "Mobile push (future)"],
                  ] as const
                ).map(([key, labelText]) => (
                  <label key={key} className="flex items-center gap-2 rounded border border-border/50 bg-black/20 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={channels[key]}
                      onChange={(event) => setChannels((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    <span>{labelText}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-black/20 p-3">
              <div className="text-xs font-semibold text-foreground mb-2">Portfolio policy templates</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setType("exposure_limit");
                    setThreshold("5000");
                    setSeverity("warning");
                    setLabelTouched(false);
                    setLabel("Net bias breach > $5,000");
                  }}
                >
                  Net bias breach
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setType("portfolio_drawdown");
                    setThreshold("0.08");
                    setTimeWindowMinutes("60");
                    setSeverity("critical");
                    setLabelTouched(false);
                    setLabel("Portfolio drawdown > 8% (1h)");
                  }}
                >
                  Portfolio drawdown
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setType("liquidity_drop");
                    setThreshold("0.2");
                    setTimeWindowMinutes("30");
                    setSeverity("warning");
                    setLabelTouched(false);
                    setLabel("Liquidity drop > 20% (30m)");
                  }}
                >
                  Liquidity drop
                </Button>
              </div>
            </div>

            <Button
              onClick={() =>
                addRule({
                  type,
                  label,
                  enabled: true,
                  marketId: requiresMarketId ? marketId : undefined,
                  threshold: Number(threshold),
                  timeWindowMinutes: Math.max(1, Number(timeWindowMinutes) || 30),
                  cooldownMinutes: Math.max(1, Number(cooldownMinutes) || 60),
                  severity,
                  channels,
                  tag: effectiveTag.trim() || undefined,
                  assetClass,
                })
              }
            >
              <Bell className="mr-2 h-4 w-4" />
              Save Alert Rule
            </Button>

            <div className="rounded-lg border border-border/50 bg-black/20 p-4 text-sm">
              <div className="font-medium text-foreground">Browser Notification Permission</div>
              <div className="mt-1 text-muted-foreground">
                Current state: <span className="font-mono-data">{notificationPermission}</span>
              </div>
              <Button className="mt-3" variant="outline" onClick={() => void requestPermission()}>
                Enable Browser Notifications
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Active Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value === "all" ? "all" : (value as AlertRuleType))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL</SelectItem>
                      <SelectItem value="price_move">Market Price Move</SelectItem>
                      <SelectItem value="time_window_move">Time-Windowed Move</SelectItem>
                      <SelectItem value="exposure_limit">Exposure Threshold</SelectItem>
                      <SelectItem value="market_drawdown">Market Drawdown</SelectItem>
                      <SelectItem value="portfolio_drawdown">Portfolio Drawdown</SelectItem>
                      <SelectItem value="liquidity_drop">Liquidity / OI Drop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Severity</Label>
                  <Select
                    value={severityFilter}
                    onValueChange={(value) => setSeverityFilter(value === "all" ? "all" : (value as AlertSeverity))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Asset Class</Label>
                  <Select
                    value={assetClassFilter}
                    onValueChange={(value) => setAssetClassFilter(value === "all" ? "all" : (value as any))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Asset Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="sports">Sports</SelectItem>
                      <SelectItem value="politics">Politics</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {visibleRules.map((rule) => {
                const diagnostics = getRuleDiagnostics(rule.id);
                return (
                  <div key={rule.id} className="rounded-lg border border-border/50 bg-black/20 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{rule.label}</div>
                        <div className="text-xs text-muted-foreground">{ruleDescription(rule)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.enabled} onCheckedChange={(checked) => setRuleEnabled(rule.id, !!checked)} />
                        <Button variant="ghost" size="icon" onClick={() => removeRule(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(rule.severity)}>{rule.severity}</Badge>
                      <Badge variant="outline">{ruleTypeLabel(rule.type)}</Badge>
                      {rule.tag ? <Badge variant="outline">tag:{rule.tag}</Badge> : null}
                      {rule.assetClass ? <Badge variant="outline">{rule.assetClass}</Badge> : null}
                      <Badge variant="outline">cooldown:{rule.cooldownMinutes}m</Badge>
                      {rule.timeWindowMinutes ? <Badge variant="outline">window:{rule.timeWindowMinutes}m</Badge> : null}
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                      <div>Last fired: {diagnostics.lastFiredAt ? new Date(diagnostics.lastFiredAt).toLocaleString() : "never"}</div>
                      <div>Times fired (7d): {diagnostics.firedCount7d}</div>
                      <div>Backtest summary hits: {diagnostics.backtestHits}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Channels:</span>
                      {Object.entries(rule.channels)
                        .filter(([, enabled]) => enabled)
                        .map(([channel]) => (
                          <Badge key={channel} variant="outline">
                            {channel}
                          </Badge>
                        ))}
                      <Button variant="outline" size="sm" onClick={() => setSelectedRuleIdForEvents(rule.id)}>
                        Show linked events
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>
                Recent Alert Events {selectedRuleIdForEvents ? `(Filtered by rule ${selectedRuleIdForEvents})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedRuleIdForEvents ? (
                <div className="mb-3">
                  <Button size="sm" variant="outline" onClick={() => setSelectedRuleIdForEvents(null)}>
                    Clear Rule Filter
                  </Button>
                </div>
              ) : null}
              {visibleEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">No alerts have fired yet.</div>
              ) : (
                <div
                  className="space-y-3 pr-1"
                  style={{ height: "320px", overflowY: "auto" }}
                  aria-label="Recent alert events list"
                >
                  {visibleEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-border/50 bg-black/20 p-3 shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{event.title}</div>
                        <Badge variant={severityVariant(event.severity)}>{event.severity}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{event.description}</div>
                      <div className="mt-2 text-xs font-mono-data text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </div>
                      {(() => {
                        const linkedMarketId = event.ruleId ? rulesById.get(event.ruleId)?.marketId : undefined;
                        return linkedMarketId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              window.location.href = `/correlations?marketId=${encodeURIComponent(linkedMarketId)}`;
                            }}
                          >
                            Open hedge preview
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              window.location.href = `/markets`;
                            }}
                          >
                            Open order ticket
                          </Button>
                        </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
