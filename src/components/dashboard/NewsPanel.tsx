import { useNewsFeed, NewsItem } from "@/hooks/useNewsFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Newspaper, Bot, ExternalLink, TrendingUp, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsItemRowProps {
  item: NewsItem;
  showSymbols?: boolean;
}

function NewsItemRow({ item, showSymbols = true }: NewsItemRowProps) {
  const timeAgo = formatDistanceToNow(new Date(item.published_at), { addSuffix: true });
  
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full min-w-0 p-3 rounded-md hover:bg-muted/50 transition-colors border border-border/30 bg-muted/20"
    >
      <div className="flex items-start gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground/90 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground truncate">
            <span className="font-mono">{item.outlet || item.source}</span>
            <span className="opacity-50">•</span>
            <Clock className="h-2.5 w-2.5 flex-shrink-0" />
            <span>{timeAgo}</span>
            {item.importance > 0 && (
              <>
                <span className="opacity-50">•</span>
                <TrendingUp className="h-2.5 w-2.5 text-green-500 flex-shrink-0" />
                <span className="text-green-500">+{item.importance}</span>
              </>
            )}
          </div>
          {showSymbols && item.symbols.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.symbols.slice(0, 3).map((symbol) => (
                <Badge 
                  key={symbol} 
                  variant="outline" 
                  className="text-[9px] px-1.5 py-0 h-4 font-mono"
                >
                  {symbol.replace('-USD', '')}
                </Badge>
              ))}
              {item.symbols.length > 3 && (
                <Badge 
                  variant="outline" 
                  className="text-[9px] px-1.5 py-0 h-4 opacity-50"
                >
                  +{item.symbols.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>
    </a>
  );
}

interface NewsLaneProps {
  title: string;
  icon: React.ReactNode;
  items: NewsItem[];
  emptyMessage: string;
  showSymbols?: boolean;
  maxHeight?: string;
}

function NewsLane({ title, icon, items, emptyMessage, showSymbols = true, maxHeight = "280px" }: NewsLaneProps) {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 ml-auto">
          {items.length}
        </Badge>
      </div>
      <ScrollArea style={{ height: maxHeight }} className="flex-1">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4 italic">
            {emptyMessage}
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full min-w-0 pr-2">
            {items.map((item) => (
              <NewsItemRow key={item.id} item={item} showSymbols={showSymbols} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function NewsPanel() {
  const { data, isLoading, error } = useNewsFeed();
  
  if (error) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            News Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-destructive">
            Failed to load news. Run news-poll first.
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading || !data) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Newspaper className="h-4 w-4" />
            News Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground animate-pulse">
            Loading news...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const { market_lane, bot_lane, news_intensity, bot_symbols } = data;
  
  // Find symbols with high news intensity
  const hotSymbols = Object.entries(news_intensity)
    .filter(([_, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Newspaper className="h-4 w-4" />
          News Feed
          {hotSymbols.length > 0 && (
            <div className="flex gap-1 ml-auto">
              {hotSymbols.map(([symbol, count]) => (
                <Badge 
                  key={symbol} 
                  variant="destructive" 
                  className="text-[9px] px-1 py-0 h-4 font-mono animate-pulse"
                >
                  {symbol.replace('-USD', '')} 🔥{count}
                </Badge>
              ))}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 h-[calc(100%-3rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full h-full">
          <NewsLane
            title="Market / Macro"
            icon={<Newspaper className="h-3 w-3 text-muted-foreground" />}
            items={market_lane}
            emptyMessage="No recent market news"
            showSymbols={true}
          />
          <NewsLane
            title="Your Bot's World"
            icon={<Bot className="h-3 w-3 text-primary" />}
            items={bot_lane}
            emptyMessage={bot_symbols.length === 0 ? "No active positions" : "No news for your symbols"}
            showSymbols={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default NewsPanel;
