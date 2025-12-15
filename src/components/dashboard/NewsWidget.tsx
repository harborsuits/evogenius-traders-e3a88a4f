import { useNewsFeed } from "@/hooks/useNewsFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Newspaper, ExternalLink, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export function NewsWidget() {
  const { data, isLoading } = useNewsFeed();

  const items = (data?.market_lane || []).slice(0, 8);
  const newsIntensity = data?.news_intensity || {};
  
  // Get hot symbols
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <Card className="w-56 bg-card/90 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Newspaper className="h-3 w-3" />
          News
          {hotSymbols.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <Flame className="h-3 w-3 text-orange-500" />
              {hotSymbols.map(([symbol]) => (
                <Badge 
                  key={symbol}
                  variant="outline"
                  className="text-[8px] px-1 py-0 h-4 font-mono border-orange-500/30 text-orange-400"
                >
                  {symbol.replace('-USD', '')}
                </Badge>
              ))}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground animate-pulse">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No recent news
          </div>
        ) : (
          <ScrollArea className="h-48">
            <div className="space-y-1 px-2 pb-2">
              {items.map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-1.5 rounded hover:bg-muted/50 transition-colors group"
                >
                  <p className="text-[10px] leading-tight text-foreground/90 line-clamp-2 group-hover:text-primary transition-colors">
                    {n.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-muted-foreground truncate">
                      {n.outlet || n.source}
                    </span>
                    <span className="text-[9px] text-muted-foreground/50">•</span>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.published_at), { addSuffix: false })}
                    </span>
                    <ExternalLink className="h-2 w-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default NewsWidget;
