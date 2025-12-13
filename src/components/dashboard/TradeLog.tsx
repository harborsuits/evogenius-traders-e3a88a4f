import { Trade } from '@/types/evotrader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

interface TradeLogProps {
  trades: Trade[];
  maxHeight?: string;
}

export function TradeLog({ trades, maxHeight = "400px" }: TradeLogProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Card variant="terminal">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Recent Trades
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {trades.length} entries
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }}>
          <div className="px-6 pb-4 space-y-1">
            {trades.map((trade) => (
              <div 
                key={trade.id}
                className={cn(
                  'flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-transparent',
                  'hover:border-border transition-colors',
                  trade.outcome !== 'success' && 'opacity-60'
                )}
              >
                {/* Side indicator */}
                <div className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-lg',
                  trade.side === 'BUY' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                )}>
                  {trade.side === 'BUY' ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </div>

                {/* Trade details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {trade.symbol}
                    </span>
                    <Badge 
                      variant={trade.side === 'BUY' ? 'active' : 'removed'} 
                      className="text-xs"
                    >
                      {trade.side}
                    </Badge>
                    {trade.outcome !== 'success' && (
                      <Badge variant="destructive" className="text-xs">
                        {trade.outcome}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                    <span>{trade.agent_id}</span>
                    <span>•</span>
                    <span>${trade.fill_price.toLocaleString()}</span>
                    <span>•</span>
                    <span>{trade.fill_size.toFixed(6)}</span>
                  </div>
                </div>

                {/* P&L */}
                <div className="text-right">
                  <p className={cn(
                    'font-mono text-sm font-medium',
                    trade.pnl >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(trade.timestamp)} {formatTime(trade.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
