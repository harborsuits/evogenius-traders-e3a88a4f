import { Badge } from '@/components/ui/badge';
import { MarketData } from '@/types/evotrader';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketTickerProps {
  markets: MarketData[];
}

export function MarketTicker({ markets }: MarketTickerProps) {
  return (
    <div className="flex items-center gap-6 px-4 py-3 bg-card border border-border rounded-lg overflow-x-auto">
      {markets.map((market) => (
        <div key={market.symbol} className="flex items-center gap-4 min-w-fit">
          <div className="flex flex-col">
            <span className="font-mono text-xs text-muted-foreground">
              {market.symbol}
            </span>
            <span className="font-mono text-lg font-bold text-foreground">
              ${market.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          
          <div className={cn(
            'flex items-center gap-1 font-mono text-sm',
            market.change_24h >= 0 ? 'text-success' : 'text-destructive'
          )}>
            {market.change_24h >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>
              {market.change_24h >= 0 ? '+' : ''}{market.change_24h.toFixed(2)}%
            </span>
          </div>
          
          <Badge variant="outline" className="text-xs">
            {market.regime}
          </Badge>
          
          <div className="h-8 w-px bg-border" />
        </div>
      ))}
      
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-xs font-mono">Last update:</span>
        <span className="text-xs font-mono text-primary">
          {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
