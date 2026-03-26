import type { DashboardData } from "@shared/schema";
import { Link } from "wouter";
import type { MouseEvent } from "react";
import { ChevronRight, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { useWallet } from "@/hooks/use-wallet";
import { useAppKit } from "@reown/appkit/react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

type DashboardPortfolio = DashboardData["portfolios"][number];

export function PortfolioCard({ item }: { item: DashboardPortfolio }) {
  const { portfolio, summary } = item;
  const positivePnl = summary.unrealizedPnl >= 0;
  const { walletAddress, isConnecting } = useWallet();
  const { open } = useAppKit();

  const isPolymarketAccount = portfolio.id === 1;

  const handleCardClick = (e: MouseEvent) => {
    if (!isPolymarketAccount) return;
    if (walletAddress) return;
    e.preventDefault();

    toast({
      title: "Wallet required",
      description: "Connect your wallet to view your Polymarket account portfolio.",
      variant: "destructive",
      action: (
        <ToastAction altText="Connect wallet" onClick={() => void open()}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </ToastAction>
      ),
    });
  };

  return (
    <Link
      href={`/portfolio/${portfolio.id}`}
      className="block h-full"
      onClick={handleCardClick}
    >
      <Card className="glass-panel h-full border-border/50 transition-all duration-300 hover:border-primary/50">
        <CardContent className="flex h-full flex-col justify-between p-6">
          <div>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Briefcase className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="border-border/50 text-muted-foreground">
                {summary.marketCount} markets
              </Badge>
            </div>

            <h3 className="text-xl font-bold text-foreground">{portfolio.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground font-mono-data">
              P-{portfolio.id.toString().padStart(4, "0")} • {summary.positionCount} positions
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Exposure" value={formatCurrency(summary.grossExposure)} />
              <Metric label="Net Bias" value={formatSignedCurrency(summary.netExposure)} />
              <Metric label="Largest Weight" value={formatPercent(summary.largestPositionWeight)} />
              <Metric label="Diversification" value={formatPercent(summary.diversificationScore)} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-black/20 px-3 py-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Unrealized PnL</div>
                <div className={positivePnl ? "text-emerald-400" : "text-red-400"}>
                  {formatSignedCurrency(summary.unrealizedPnl)} ({formatPercent(summary.unrealizedPnlPct)})
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono-data text-sm text-foreground">{value}</div>
    </div>
  );
}
