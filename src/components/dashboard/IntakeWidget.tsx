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
  Globe,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NewsDock } from "@/components/orbital/OrbitalCommandCenter";

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

interface IntakeWidgetProps {
  dock?: NewsDock;
  onDockChange?: (dock: NewsDock) => void;
}

export function IntakeWidget({ dock = "side", onDockChange }: IntakeWidgetProps) {
  const { data: newsData, isLoading } = useNewsFeed();
  
  const newsIntensity = newsData?.news_intensity || {};
  const botSymbols = newsData?.bot_symbols || [];
  const topVolumeSymbols = newsData?.top_volume_symbols || [];
  
  // Hot symbols from news mentions
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  // Section A: Catalyst Watch (strict monitored symbols with event tags)
  const catalystNews = (newsData?.bot_lane || []).slice(0, 8);
  
  // Section B: Market Context (fallback macro/general news)
  const marketNews = (newsData?.market_lane || [])
    .filter(n => !catalystNews.some(c => c.id === n.id))
    .slice(0, 8);
  
  // Target: fill card with labeled sections
  const TARGET_ITEMS = 10;
  const catalystCount = catalystNews.length;
  const contextCount = Math.max(0, TARGET_ITEMS - catalystCount);
  const displayContextNews = marketNews.slice(0, contextCount);
  
  return (
    <Card className="w-full h-full max-h-full flex flex-col bg-card/95 backdrop-blur-sm border-border/50 shadow-lg overflow-hidden">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span>Intake</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal border-muted-foreground/30">
            catalyst watch
          </Badge>
          {hotSymbols.length > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              {hotSymbols.slice(0, 2).map(([symbol]) => (
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
          {/* Dock controls */}
          {onDockChange && (
            <div className="flex items-center gap-0.5 ml-auto shrink-0">
              <button
                onClick={() => onDockChange("top")}
                className={`p-1 rounded text-[10px] border transition-colors ${
                  dock === "top" 
                    ? "bg-primary/20 border-primary/40 text-primary" 
                    : "border-border/50 text-muted-foreground hover:bg-muted/50"
                }`}
                title="Dock to top"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDockChange("bottom")}
                className={`p-1 rounded text-[10px] border transition-colors ${
                  dock === "bottom" 
                    ? "bg-primary/20 border-primary/40 text-primary" 
                    : "border-border/50 text-muted-foreground hover:bg-muted/50"
                }`}
                title="Dock to bottom"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDockChange("side")}
                className={`p-1 rounded text-[10px] border transition-colors ${
                  dock === "side" 
                    ? "bg-primary/20 border-primary/40 text-primary" 
                    : "border-border/50 text-muted-foreground hover:bg-muted/50"
                }`}
                title="Dock to side"
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground animate-pulse text-center">
            Loading catalysts…
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-3 pb-3 space-y-3">
              {/* Section A: Catalyst Watch (Strict) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80 uppercase tracking-wide font-medium px-1 border-b border-border/30 pb-1">
                  <Eye className="h-3 w-3" />
                  <span>Catalyst Watch</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-primary/30">
                    {catalystCount} found
                  </Badge>
                </div>
                
                {catalystNews.length > 0 ? (
                  <div className="space-y-1.5">
                    {catalystNews.map((n) => {
                      const eventType = detectEventType(n.title);
                      const symbols = n.symbols || [];
                      const timeAgo = formatTimeAgo(n.published_at);
                      
                      return (
                        <a
                          key={n.id}
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-1 p-2 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors group border border-primary/10 hover:border-primary/20"
                        >
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
                          <p className="text-[11px] leading-snug text-foreground/80 line-clamp-2 group-hover:text-primary transition-colors">
                            {n.title}
                          </p>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                    <div className="text-[10px] text-muted-foreground/60">
                      No monitored-coin catalysts detected
                    </div>
                    {botSymbols.length > 0 && (
                      <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                        Watching: {botSymbols.slice(0, 5).map(s => s.replace('-USD', '')).join(', ')}
                        {botSymbols.length > 5 && ` +${botSymbols.length - 5}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Section B: Market Context (Fallback) */}
              {displayContextNews.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide px-1 border-b border-border/20 pb-1">
                    <Globe className="h-3 w-3" />
                    <span>Market Context</span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-muted-foreground/20">
                      fallback
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    {displayContextNews.map((n) => {
                      const timeAgo = formatTimeAgo(n.published_at);
                      const symbols = n.symbols || [];
                      
                      return (
                        <a
                          key={n.id}
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col gap-0.5 p-1.5 rounded bg-muted/20 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            {symbols.slice(0, 1).map((s) => (
                              <span key={s} className="text-[9px] font-mono text-muted-foreground/60">
                                {s.replace('-USD', '')}
                              </span>
                            ))}
                            <span className="text-[9px] text-muted-foreground/40 ml-auto">
                              {timeAgo}
                            </span>
                          </div>
                          <p className="text-[10px] leading-snug text-foreground/60 line-clamp-1 hover:text-foreground/80">
                            {n.title}
                          </p>
                        </a>
                      );
                    })}
                  </div>
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
