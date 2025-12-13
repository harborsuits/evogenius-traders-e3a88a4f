import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MarketData } from '@/types/evotrader';
import { TrendingUp, TrendingDown, RefreshCw, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface MarketTickerProps {
  markets: MarketData[];
}

export function MarketTicker({ markets }: MarketTickerProps) {
  const [polling, setPolling] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handlePollMarket = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('market-poll');
      
      if (error) {
        toast({
          title: 'Market poll failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'market-data',
      });

      toast({
        title: 'Market data updated',
        description: `Updated ${data.updated} symbols from Coinbase`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to fetch market data',
        variant: 'destructive',
      });
    } finally {
      setPolling(false);
    }
  };

  // Get the most recent update time from market data
  const lastUpdate = markets.length > 0 
    ? new Date(Math.max(...markets.map(m => new Date(m.updated_at).getTime())))
    : null;

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
      
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Radio className="h-3 w-3 text-primary animate-pulse" />
          <span className="text-xs font-mono">Coinbase</span>
        </div>
        
        <div className="h-4 w-px bg-border" />
        
        <span className="text-xs font-mono text-muted-foreground">
          {lastUpdate ? lastUpdate.toLocaleTimeString() : 'No data'}
        </span>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePollMarket}
          disabled={polling}
          className="h-7 px-2"
        >
          <RefreshCw className={cn('h-3 w-3', polling && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}