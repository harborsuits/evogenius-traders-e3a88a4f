import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MarketData } from '@/types/evotrader';
import { TrendingUp, TrendingDown, RefreshCw, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useSystemState } from '@/hooks/useEvoTraderData';

interface MarketTickerProps {
  markets: MarketData[];
}

export function MarketTicker({ markets }: MarketTickerProps) {
  const [polling, setPolling] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: systemState } = useSystemState();

  const handlePollMarket = useCallback(async (silent = false) => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('market-poll');
      
      if (error) {
        if (!silent) {
          toast({
            title: 'Market poll failed',
            description: error.message,
            variant: 'destructive',
          });
        }
        return;
      }

      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'market-data',
      });

      if (!silent) {
        toast({
          title: 'Market data updated',
          description: `Updated ${data.updated} symbols from Coinbase`,
        });
      }
    } catch (err) {
      if (!silent) {
        toast({
          title: 'Error',
          description: 'Failed to fetch market data',
          variant: 'destructive',
        });
      }
    } finally {
      setPolling(false);
    }
  }, [queryClient, toast]);

  // Determine polling interval based on system status
  const getPollingInterval = useCallback(() => {
    if (!systemState) return 60000; // Default 60s
    switch (systemState.status) {
      case 'running': return 60000;  // 60 seconds
      case 'paused': return 300000;  // 5 minutes
      case 'stopped': return 0;      // No polling
      default: return 60000;
    }
  }, [systemState]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh) {
      const interval = getPollingInterval();
      if (interval > 0) {
        // Poll immediately when enabled
        handlePollMarket(true);
        intervalRef.current = setInterval(() => handlePollMarket(true), interval);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, getPollingInterval, handlePollMarket]);

  // Get the most recent update time from market data
  const lastUpdate = markets.length > 0 
    ? new Date(Math.max(...markets.map(m => new Date(m.updated_at).getTime())))
    : null;

  const intervalLabel = systemState?.status === 'running' ? '60s' 
    : systemState?.status === 'paused' ? '5m' 
    : 'off';

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
        <div className="flex items-center gap-2">
          <Switch
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
            className="scale-75"
          />
          <span className="text-xs font-mono text-muted-foreground">
            Auto ({intervalLabel})
          </span>
        </div>
        
        <div className="h-4 w-px bg-border" />
        
        <div className="flex items-center gap-2 text-muted-foreground">
          <Radio className={cn('h-3 w-3', autoRefresh && 'text-primary animate-pulse')} />
          <span className="text-xs font-mono">Coinbase</span>
        </div>
        
        <div className="h-4 w-px bg-border" />
        
        <span className="text-xs font-mono text-muted-foreground">
          {lastUpdate ? lastUpdate.toLocaleTimeString() : 'No data'}
        </span>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePollMarket(false)}
          disabled={polling}
          className="h-7 px-2"
        >
          <RefreshCw className={cn('h-3 w-3', polling && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}