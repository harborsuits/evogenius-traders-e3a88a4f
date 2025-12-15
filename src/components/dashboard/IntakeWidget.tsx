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
  Wallet,
  Handshake,
  AlertTriangle,
  Globe
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Event type detection with more categories
function detectEventType(title: string): { icon: React.ReactNode; label: string; color: string } | null {
  const lower = title.toLowerCase();
  
  if (lower.includes('unlock') || lower.includes('vesting') || lower.includes('emission')) {
    return { icon: <Unlock className="h-3 w-3" />, label: 'unlock', color: 'text-amber-400' };
  }
  if (lower.includes('upgrade') || lower.includes('mainnet') || lower.includes('fork')) {
    return { icon: <Wrench className="h-3 w-3" />, label: 'upgrade', color: 'text-blue-400' };
  }
  if (lower.includes('outage') || lower.includes('bug') || lower.includes('exploit') || lower.includes('hack')) {
    return { icon: <AlertTriangle className="h-3 w-3" />, label: 'outage', color: 'text-red-400' };
  }
  if (lower.includes('listing') || lower.includes('delist') || lower.includes('binance') || lower.includes('coinbase adds')) {
    return { icon: <Megaphone className="h-3 w-3" />, label: 'listing', color: 'text-green-400' };
  }
  if (lower.includes('sec') || lower.includes('regulation') || lower.includes('lawsuit') || lower.includes('fine') || lower.includes('investigation')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'legal', color: 'text-red-400' };
  }
  if (lower.includes('whale') || lower.includes('transfer') || lower.includes('moved') || lower.includes('wallet')) {
    return { icon: <Wallet className="h-3 w-3" />, label: 'whale', color: 'text-purple-400' };
  }
  if (lower.includes('governance') || lower.includes('vote') || lower.includes('proposal') || lower.includes('dao')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'gov', color: 'text-cyan-400' };
  }
  if (lower.includes('partner') || lower.includes('collab') || lower.includes('integration') || lower.includes('launch')) {
    return { icon: <Handshake className="h-3 w-3" />, label: 'partner', color: 'text-emerald-400' };
  }
  
  return null;
}

function formatTimeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false })
      .replace('about ', '')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace('less than a', '<1');
  } catch {
    return '';
  }
}

export function IntakeWidget() {
  const { data: newsData, isLoading } = useNewsFeed();
  
  const newsIntensity = newsData?.news_intensity || {};
  const botSymbols = newsData?.bot_symbols || [];
  const topVolumeSymbols = newsData?.top_volume_symbols || [];
  
  // Hot symbols from news mentions
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  // Bot lane = news about symbols we touched (relevant catalysts)
  const relevantNews = (newsData?.bot_lane || []).slice(0, 8);
  
  // Market lane = general/macro news (fallback)
  const macroNews = (newsData?.market_lane || [])
    .filter(n => {
      // Filter to BTC/ETH/macro only
      const symbols = n.symbols || [];
      return symbols.length === 0 || 
             symbols.some(s => ['BTC-USD', 'ETH-USD'].includes(s));
    })
    .slice(0, 3);
  
  const hasRelevantNews = relevantNews.length > 0;
  
  return (
    <Card className="w-full bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span>Intake</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal border-muted-foreground/30">
            catalyst watch
          </Badge>
          {hotSymbols.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              {hotSymbols.map(([symbol]) => (
                <Badge 
                  key={symbol}
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 font-mono border-orange-500/30 text-orange-400"
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
          <div className="px-4 py-6 text-xs text-muted-foreground animate-pulse text-center">
            Loading catalysts…
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-3 pb-3">
              {hasRelevantNews ? (
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                  {relevantNews.map((n) => {
                    const eventType = detectEventType(n.title);
                    const symbols = n.symbols || [];
                    const timeAgo = formatTimeAgo(n.published_at);
                    
                    return (
                      <a
                        key={n.id}
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group border border-transparent hover:border-border/50"
                      >
                        {/* Header: symbols + event tag + time */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {symbols.slice(0, 2).map((s) => (
                            <Badge 
                              key={s} 
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 font-mono font-semibold"
                            >
                              {s.replace('-USD', '')}
                            </Badge>
                          ))}
                          {eventType && (
                            <span className={`flex items-center gap-0.5 text-[9px] ${eventType.color}`}>
                              {eventType.icon}
                              <span>{eventType.label}</span>
                            </span>
                          )}
                          <span className="text-[9px] text-muted-foreground/60 ml-auto">
                            {timeAgo}
                          </span>
                        </div>
                        
                        {/* Title - allow 2 lines */}
                        <p className="text-[12px] leading-snug text-foreground/80 line-clamp-2 group-hover:text-primary transition-colors">
                          {n.title}
                        </p>
                        
                        {/* Source */}
                        <span className="text-[9px] text-muted-foreground/50">
                          {n.outlet || n.source}
                        </span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* No monitored catalysts message */}
                  <div className="text-center py-3 px-2 bg-muted/20 rounded-md">
                    <div className="text-[11px] text-muted-foreground font-medium">
                      No monitored-coin catalysts
                    </div>
                    {botSymbols.length > 0 && (
                      <div className="text-[10px] text-muted-foreground/60 mt-1">
                        Watching: {botSymbols.slice(0, 6).map(s => s.replace('-USD', '')).join(', ')}
                        {botSymbols.length > 6 && ` +${botSymbols.length - 6}`}
                      </div>
                    )}
                  </div>
                  
                  {/* Market/Macro fallback lane */}
                  {macroNews.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 px-1">
                        <Globe className="h-3 w-3" />
                        <span>Market / Macro</span>
                      </div>
                      {macroNews.map((n) => (
                        <a
                          key={n.id}
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-2 rounded bg-muted/20 hover:bg-muted/30 transition-colors"
                        >
                          <p className="text-[11px] leading-snug text-foreground/60 line-clamp-2 hover:text-foreground/80">
                            {n.title}
                          </p>
                          <span className="text-[9px] text-muted-foreground/40">
                            {formatTimeAgo(n.published_at)} • {n.outlet || n.source}
                          </span>
                        </a>
                      ))}
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
