import { useNewsFeed } from "@/hooks/useNewsFeed";
import { useMissedMoves } from "@/hooks/useMissedMoves";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, TrendingUp, TrendingDown, Newspaper, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function NewsWidget() {
  const { data: newsData, isLoading: newsLoading } = useNewsFeed();
  const { data: missedData, isLoading: missedLoading } = useMissedMoves();

  const isLoading = newsLoading || missedLoading;
  const missedMoves = missedData?.missed_moves || [];
  const newsIntensity = newsData?.news_intensity || {};
  
  // Get hot symbols from news
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <Card className="w-56 bg-card/90 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          Context
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
        ) : (
          <ScrollArea className="h-48">
            <div className="space-y-0.5 px-2 pb-2">
              {/* Missed Moves Section */}
              {missedMoves.length > 0 && (
                <>
                  {missedMoves.slice(0, 5).map((m) => (
                    <div
                      key={m.symbol}
                      className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30"
                    >
                      {m.move_type === 'pump' ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-[10px] font-semibold text-foreground">
                        {m.symbol.replace('-USD', '')}
                      </span>
                      <span className={`text-[10px] font-mono ${
                        m.move_type === 'pump' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                      </span>
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {m.last_decision === 'HOLD' ? 'no signal' : 'missed'}
                      </span>
                    </div>
                  ))}
                  <div className="h-px bg-border/30 my-1.5" />
                </>
              )}
              
              {/* News Section - just top 3 headlines */}
              {(newsData?.market_lane || []).slice(0, 3).map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1.5 p-1 rounded hover:bg-muted/50 transition-colors group"
                >
                  <Newspaper className="h-2.5 w-2.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-[9px] leading-tight text-foreground/70 line-clamp-2 group-hover:text-primary transition-colors">
                    {n.title}
                  </p>
                </a>
              ))}
              
              {missedMoves.length === 0 && (!newsData?.market_lane || newsData.market_lane.length === 0) && (
                <div className="px-1 py-4 text-[10px] text-muted-foreground text-center">
                  No significant moves or news
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default NewsWidget;
