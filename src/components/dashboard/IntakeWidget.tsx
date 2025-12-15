import { useNewsFeed } from "@/hooks/useNewsFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Eye, 
  Flame, 
  Unlock, 
  Wrench, 
  Megaphone, 
  Scale,
  Wallet
} from "lucide-react";

// Event type detection (rough tagging for now)
function detectEventType(title: string): { icon: React.ReactNode; label: string } | null {
  const lower = title.toLowerCase();
  
  if (lower.includes('unlock') || lower.includes('vesting') || lower.includes('emission')) {
    return { icon: <Unlock className="h-2.5 w-2.5 text-amber-400" />, label: 'unlock' };
  }
  if (lower.includes('upgrade') || lower.includes('mainnet') || lower.includes('fork') || lower.includes('outage') || lower.includes('bug')) {
    return { icon: <Wrench className="h-2.5 w-2.5 text-blue-400" />, label: 'tech' };
  }
  if (lower.includes('listing') || lower.includes('delist') || lower.includes('binance') || lower.includes('coinbase adds')) {
    return { icon: <Megaphone className="h-2.5 w-2.5 text-green-400" />, label: 'exchange' };
  }
  if (lower.includes('sec') || lower.includes('regulation') || lower.includes('lawsuit') || lower.includes('fine')) {
    return { icon: <Scale className="h-2.5 w-2.5 text-red-400" />, label: 'legal' };
  }
  if (lower.includes('whale') || lower.includes('transfer') || lower.includes('moved')) {
    return { icon: <Wallet className="h-2.5 w-2.5 text-purple-400" />, label: 'whale' };
  }
  if (lower.includes('governance') || lower.includes('vote') || lower.includes('proposal') || lower.includes('dao')) {
    return { icon: <Scale className="h-2.5 w-2.5 text-cyan-400" />, label: 'gov' };
  }
  
  return null;
}

export function IntakeWidget() {
  const { data: newsData, isLoading } = useNewsFeed();
  
  const newsIntensity = newsData?.news_intensity || {};
  const botSymbols = newsData?.bot_symbols || [];
  
  // Hot symbols from news mentions
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  // Filter to only coin-specific news (bot lane = news about symbols we touched)
  const relevantNews = (newsData?.bot_lane || []).slice(0, 6);
  
  return (
    <Card className="w-56 bg-card/90 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Eye className="h-3 w-3" />
          Intake
          <span className="text-[8px] text-muted-foreground/60 ml-1">speculative</span>
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
              {relevantNews.length > 0 ? (
                relevantNews.map((n) => {
                  const eventType = detectEventType(n.title);
                  const symbols = n.symbols || [];
                  
                  return (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 p-1.5 rounded hover:bg-muted/50 transition-colors group"
                    >
                      {eventType?.icon || <Eye className="h-2.5 w-2.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {symbols.slice(0, 2).map((s) => (
                            <span key={s} className="text-[8px] font-mono font-semibold text-primary">
                              {s.replace('-USD', '')}
                            </span>
                          ))}
                          {eventType && (
                            <span className="text-[7px] text-muted-foreground/60">
                              {eventType.label}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] leading-tight text-foreground/70 line-clamp-2 group-hover:text-primary transition-colors">
                          {n.title}
                        </p>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="px-1 py-4 text-[10px] text-muted-foreground text-center">
                  No coin-specific news
                  {botSymbols.length > 0 && (
                    <div className="mt-1 text-[8px]">
                      Watching: {botSymbols.slice(0, 4).map(s => s.replace('-USD', '')).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default IntakeWidget;
