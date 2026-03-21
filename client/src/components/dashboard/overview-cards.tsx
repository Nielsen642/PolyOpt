import type { DashboardOverview } from "@shared/schema";
import { Activity, Briefcase, DollarSign, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompactNumber, formatSignedCurrency } from "@/lib/formatters";

const items = [
  {
    key: "totalPortfolios",
    label: "Portfolios",
    icon: Briefcase,
    formatter: (value: number) => formatCompactNumber(value),
  },
  {
    key: "totalMarkets",
    label: "Tracked Markets",
    icon: Activity,
    formatter: (value: number) => formatCompactNumber(value),
  },
  {
    key: "totalGrossExposure",
    label: "Gross Exposure",
    icon: DollarSign,
    formatter: (value: number) => formatSignedCurrency(value),
  },
  {
    key: "totalUnrealizedPnl",
    label: "Unrealized PnL",
    icon: TrendingUp,
    formatter: (value: number) => formatSignedCurrency(value),
  },
] as const;

export function OverviewCards({ overview }: { overview: DashboardOverview }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const value = overview[item.key];

        return (
          <Card key={item.key} className="glass-panel border-border/50">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-2 text-2xl font-bold font-mono-data text-foreground">
                  {item.formatter(value)}
                </div>
              </div>
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
