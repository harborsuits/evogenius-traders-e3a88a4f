import { useNewsFeed } from "@/hooks/useNewsFeed";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Flame, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function NewsTicker() {
  const { data, isLoading } = useNewsFeed();
  
  if (isLoading || !data) {
    return (
      <div className="h-8 bg-background/50 border-t border-border/30 flex items-center px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <Newspaper className="h-3 w-3" />
          <span className="font-mono">Loading news...</span>
        </div>
      </div>
    );
  }
  
  const { market_lane, news_intensity } = data;
  
  // Get hot symbols (2+ mentions in last 2 hours)
  const hotSymbols = Object.entries(news_intensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  // Get top 10 newest headlines
  const tickerItems = market_lane.slice(0, 10);
  
  if (tickerItems.length === 0 && hotSymbols.length === 0) {
    return null;
  }

  return (
    <div className="h-8 bg-background/80 backdrop-blur-sm border-t border-border/30 overflow-hidden">
      <div className="h-full flex items-center animate-ticker">
        {/* Hot symbols first */}
        {hotSymbols.length > 0 && (
          <div className="flex items-center gap-2 px-4 border-r border-border/30 flex-shrink-0">
            <Flame className="h-3 w-3 text-orange-500" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Hot</span>
            {hotSymbols.map(([symbol, count]) => (
              <Badge 
                key={symbol}
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-5 font-mono border-orange-500/30 text-orange-400"
              >
                {symbol.replace('-USD', '')}
                <span className="ml-1 opacity-70">×{count}</span>
              </Badge>
            ))}
          </div>
        )}
        
        {/* Scrolling headlines */}
        <div className="flex items-center gap-6 px-4 ticker-scroll">
          {[...tickerItems, ...tickerItems].map((item, idx) => {
            const timeAgo = formatDistanceToNow(new Date(item.published_at), { addSuffix: false });
            
            return (
              <a
                key={`${item.id}-${idx}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 flex-shrink-0 group hover:text-primary transition-colors"
              >
                <span className="text-xs text-foreground/80 group-hover:text-primary whitespace-nowrap max-w-[300px] truncate">
                  {item.title}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                  {timeAgo}
                </span>
                {item.symbols.length > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="text-[8px] px-1 py-0 h-4 font-mono"
                  >
                    {item.symbols[0].replace('-USD', '')}
                  </Badge>
                )}
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-muted-foreground/30 mx-2">•</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default NewsTicker;
