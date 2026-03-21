import type { CorrelationMatrix } from "@shared/schema";

function getCellColor(value: number) {
  if (value > 0.7) return "bg-blue-700";
  if (value > 0.4) return "bg-blue-600";
  if (value > 0.1) return "bg-blue-500";
  if (value > -0.1) return "bg-gray-700";
  if (value > -0.4) return "bg-red-500";
  if (value > -0.7) return "bg-red-600";
  return "bg-red-700";
}

function getTextColor(value: number) {
  return Math.abs(value) > 0.5 ? "text-white" : "text-gray-300";
}

export type CorrelationCellClick = {
  left: { id: string; label: string };
  right: { id: string; label: string };
  value: number;
  leftIndex: number;
  rightIndex: number;
};

export function CorrelationMatrixGrid({
  correlations,
  selectedPair,
  onCellClick,
}: {
  correlations: CorrelationMatrix;
  selectedPair?: { leftId: string; rightId: string } | null;
  onCellClick?: (payload: CorrelationCellClick) => void;
}) {
  return (
    <div className="inline-block min-w-full">
      <div className="flex gap-1">
        <div className="w-36 flex-shrink-0" />
        <div className="flex gap-1">
          {correlations.markets.map((market) => (
            <div
              key={market.id}
              className="w-20 text-center text-xs font-mono text-muted-foreground truncate"
              title={market.label}
            >
              {market.id.slice(0, 8)}
            </div>
          ))}
        </div>
      </div>

      {correlations.matrix.map((row, rowIndex) => (
        <div key={correlations.markets[rowIndex]?.id ?? rowIndex} className="mt-1 flex gap-1">
          <div
            className="w-36 flex-shrink-0 truncate pr-2 text-right text-xs text-muted-foreground"
            title={correlations.markets[rowIndex]?.label}
          >
            {correlations.markets[rowIndex]?.label}
          </div>

          <div className="flex gap-1">
            {row.map((value, columnIndex) => (
              <div
                key={`${rowIndex}-${columnIndex}`}
                className={`flex h-16 w-20 items-center justify-center rounded-md text-xs font-bold ${getCellColor(value)} ${getTextColor(value)} ${
                  selectedPair &&
                  selectedPair.leftId === correlations.markets[rowIndex]?.id &&
                  selectedPair.rightId === correlations.markets[columnIndex]?.id
                    ? "ring-2 ring-primary/70"
                    : ""
                } ${onCellClick ? "cursor-pointer hover:opacity-95" : ""}`}
                title={`${correlations.markets[rowIndex]?.label} ↔ ${correlations.markets[columnIndex]?.label}: ${value.toFixed(3)}`}
                role={onCellClick ? "button" : undefined}
                tabIndex={onCellClick ? 0 : undefined}
                onClick={
                  onCellClick
                    ? () => {
                        const left = correlations.markets[rowIndex];
                        const right = correlations.markets[columnIndex];
                        if (!left || !right) return;
                        onCellClick({
                          left: { id: left.id, label: left.label },
                          right: { id: right.id, label: right.label },
                          value,
                          leftIndex: rowIndex,
                          rightIndex: columnIndex,
                        });
                      }
                    : undefined
                }
                onKeyDown={
                  onCellClick
                    ? (e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        const left = correlations.markets[rowIndex];
                        const right = correlations.markets[columnIndex];
                        if (!left || !right) return;
                        onCellClick({
                          left: { id: left.id, label: left.label },
                          right: { id: right.id, label: right.label },
                          value,
                          leftIndex: rowIndex,
                          rightIndex: columnIndex,
                        });
                      }
                    : undefined
                }
              >
                {value.toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
