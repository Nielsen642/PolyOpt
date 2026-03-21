import type { PortfolioSummary } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";

const summaryFields = [
  { key: "grossExposure", label: "Gross Exposure", formatter: formatCurrency },
  { key: "netExposure", label: "Net Exposure", formatter: formatSignedCurrency },
  { key: "unrealizedPnl", label: "Unrealized PnL", formatter: formatSignedCurrency },
  { key: "largestPositionWeight", label: "Largest Position", formatter: formatPercent },
  { key: "diversificationScore", label: "Diversification", formatter: formatPercent },
  { key: "unrealizedPnlPct", label: "PnL %", formatter: formatPercent },
] as const;

export function PortfolioSummaryCards({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {summaryFields.map((field) => (
        <Card key={field.key} className="glass-panel border-border/50">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {field.label}
            </div>
            <div className="mt-2 text-2xl font-bold font-mono-data text-foreground">
              {field.formatter(summary[field.key])}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
