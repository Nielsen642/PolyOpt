import type { PositionAnalytics } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";

export function PositionsTable({ positions }: { positions: PositionAnalytics[] }) {
  const shortId = (value: string) => {
    const trimmed = String(value ?? "");
    if (trimmed.length <= 10) return trimmed;
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
  };

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-black/20 py-10 text-center text-muted-foreground">
        No positions added yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/50 bg-black/20">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead>Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow key={position.id} className="border-border/50 text-sm">
              <TableCell className="min-w-[220px]">
                <div className="font-medium text-foreground">
                  {position.polymarketUrl ? (
                    <a
                      href={position.polymarketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {position.question}
                    </a>
                  ) : (
                    position.question
                  )}
                </div>
                <div
                  className="font-mono-data text-xs text-muted-foreground"
                  title={position.marketId}
                >
                  {shortId(position.marketId)}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    position.side === "yes"
                      ? "border-emerald-500/30 text-emerald-400"
                      : position.side === "no"
                        ? "border-red-500/30 text-red-400"
                        : "border-border/50 text-muted-foreground"
                  }
                >
                  {position.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono-data">{formatPercent(position.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono-data">{formatPercent(position.currentPrice)}</TableCell>
              <TableCell className="text-right font-mono-data">{formatCurrency(position.currentValue)}</TableCell>
              <TableCell
                className={`text-right font-mono-data ${
                  position.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatSignedCurrency(position.pnl)}
                <div className="text-xs text-muted-foreground">{formatPercent(position.pnlPct)}</div>
              </TableCell>
              <TableCell className="text-right font-mono-data">{formatPercent(position.allocationWeight)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
