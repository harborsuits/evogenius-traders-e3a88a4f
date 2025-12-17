import { useState } from "react";
import { usePriceFeed } from "@/hooks/usePriceFeed";
import { useNewsFeed } from "@/hooks/useNewsFeed";
import { TrendingUp, TrendingDown, Newspaper, ExternalLink, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined) return "—";
  return n.toFixed(digits);
}

function PriceLane({ paused }: { paused: boolean }) {
  const { data, isLoading } = usePriceFeed();

  if (isLoading) {
    return (
      <div className="h-7 flex items-center px-4">
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
      <div className="h-7 flex items-center px-4">
        <span className="text-xs text-muted-foreground font-mono">No active symbols</span>
      </div>
    );
  }

  const items = [...rows, ...rows]; // loop for continuous scroll

  return (
    <div className="h-7 overflow-hidden">
      <div className="h-full flex items-center">
        <div className={cn(
          "flex items-center gap-6 px-4",
          paused ? "" : "animate-ticker"
        )}>
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

function NewsLane({ paused }: { paused: boolean }) {
  const { data, isLoading } = useNewsFeed();
  
  if (isLoading || !data) {
    return (
      <div className="h-7 flex items-center px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <Newspaper className="h-3 w-3" />
          <span className="font-mono">Loading news...</span>
        </div>
      </div>
    );
  }
  
  const { market_lane, news_intensity } = data;
  
  // Get hot symbols (2+ mentions in last 2 hours)
  const hotSymbols = Object.entries(news_intensity || {})
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  
  // Get top 15 newest headlines for ticker
  const tickerItems = market_lane?.slice(0, 15) || [];
  
  if (tickerItems.length === 0) {
    return (
      <div className="h-7 flex items-center px-4">
        <span className="text-xs text-muted-foreground font-mono">No recent news</span>
      </div>
    );
  }

  return (
    <div className="h-7 overflow-hidden">
      <div className="h-full flex items-center">
        {/* Hot symbols indicator */}
        {hotSymbols.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 border-r border-border/30 flex-shrink-0 h-full">
            <Flame className="h-3 w-3 text-orange-500" />
            {hotSymbols.map(([symbol, count]) => (
              <Badge 
                key={symbol}
                variant="outline"
                className="text-[8px] px-1 py-0 h-4 font-mono border-orange-500/30 text-orange-400"
              >
                {symbol.replace('-USD', '')}×{count}
              </Badge>
            ))}
          </div>
        )}
        
        {/* Scrolling headlines */}
        <div className={cn(
          "flex items-center gap-5 px-4",
          paused ? "" : "animate-ticker-slow"
        )}>
          {[...tickerItems, ...tickerItems].map((item, idx) => {
            const timeAgo = formatDistanceToNow(new Date(item.published_at), { addSuffix: false });
            
            return (
              <a
                key={`${item.id}-${idx}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 flex-shrink-0 group"
              >
                <span className="text-[10px] text-muted-foreground font-mono uppercase">
                  {item.outlet || item.source}
                </span>
                <span className="text-xs text-foreground/80 group-hover:text-primary transition-colors whitespace-nowrap max-w-[280px] truncate">
                  {item.title}
                </span>
                <span className="text-[9px] text-muted-foreground/60 font-mono">
                  {timeAgo}
                </span>
                {item.symbols?.length > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="text-[7px] px-1 py-0 h-3.5 font-mono"
                  >
                    {item.symbols[0].replace('-USD', '')}
                  </Badge>
                )}
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-muted-foreground/20 mx-1">|</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PriceTicker() {
  const [paused, setPaused] = useState(false);

  return (
    <div 
      className="bg-background/80 backdrop-blur-sm border-t border-border/30"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Price lane */}
      <div className="border-b border-border/20">
        <PriceLane paused={paused} />
      </div>
      
      {/* News lane */}
      <NewsLane paused={paused} />
    </div>
  );
}

export default PriceTicker;
