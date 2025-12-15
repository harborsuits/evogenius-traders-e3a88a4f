import { usePriceFeed } from "@/hooks/usePriceFeed";
import { TrendingUp, TrendingDown } from "lucide-react";

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined) return "—";
  return n.toFixed(digits);
}

export function PriceTicker() {
  const { data, isLoading } = usePriceFeed();

  if (isLoading) {
    return (
      <div className="h-8 bg-background/50 border-t border-border/30 flex items-center px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <TrendingUp className="h-3 w-3" />
          <span className="font-mono">Loading prices...</span>
        </div>
      </div>
    );
  }

  const rows = data?.symbols || [];
  if (rows.length === 0) {
    return (
      <div className="h-8 bg-background/50 border-t border-border/30 flex items-center px-4">
        <span className="text-xs text-muted-foreground font-mono">No active symbols</span>
      </div>
    );
  }

  const items = [...rows, ...rows]; // loop for continuous scroll

  return (
    <div className="h-8 bg-background/80 backdrop-blur-sm border-t border-border/30 overflow-hidden">
      <div className="h-full flex items-center ticker-scroll">
        <div className="flex items-center gap-6 px-4 animate-ticker">
          {items.map((r, idx) => {
            const ch = r.change_24h ?? 0;
            const isPositive = ch >= 0;
            const priceDigits = r.price && r.price < 1 ? 4 : 2;
            
            return (
              <div
                key={`${r.symbol}-${idx}`}
                className="flex items-center gap-2 flex-shrink-0"
              >
                <span className="text-xs font-semibold text-foreground">
                  {r.symbol.replace("-USD", "")}
                </span>
                <span className="text-xs font-mono text-foreground/80">
                  ${fmt(r.price, priceDigits)}
                </span>
                <span className={`text-[10px] font-mono flex items-center gap-0.5 ${
                  isPositive ? "text-emerald-400" : "text-red-400"
                }`}>
                  {isPositive ? (
                    <TrendingUp className="h-2.5 w-2.5" />
                  ) : (
                    <TrendingDown className="h-2.5 w-2.5" />
                  )}
                  {isPositive ? "+" : ""}{fmt(ch, 2)}%
                </span>
                <span className="text-muted-foreground/30 mx-1">•</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PriceTicker;
