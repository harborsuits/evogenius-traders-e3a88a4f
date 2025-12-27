import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  RefreshCw,
  DollarSign,
  Bitcoin,
  Lock,
  Radio,
  AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CoinbaseAccount {
  id: string;
  name: string;
  currency: string;
  available: number;
  hold: number;
  total: number;
  type: string;
}

interface LivePositionsCardProps {
  isArmed: boolean;
}

export function LivePositionsCard({ isArmed }: LivePositionsCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['live-positions-coinbase'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data as { ok: boolean; accounts?: CoinbaseAccount[]; error?: string };
    },
    enabled: isArmed, // Only fetch when armed
    staleTime: 10000, // 10 seconds when armed
    refetchInterval: isArmed ? 15000 : false, // Auto-refresh every 15s when armed
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Filter to only show accounts with non-zero balances
  const accounts = (data?.accounts || []).filter(a => a.total > 0);
  const hasApiError = data && !data.ok;
  const hasFetchError = isError;

  const getCurrencyIcon = (currency: string) => {
    if (currency === 'USD') return <DollarSign className="h-3 w-3" />;
    if (currency === 'BTC') return <Bitcoin className="h-3 w-3" />;
    return <Wallet className="h-3 w-3" />;
  };

  const formatBalance = (value: number, currency: string) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    if (value === 0) return '0';
    if (value < 0.0001) return value.toExponential(2);
    if (value < 1) return value.toFixed(6);
    return value.toFixed(4);
  };

  // LOCKED state - not armed
  if (!isArmed) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Live Positions
            </div>
            <Badge variant="outline" className="text-[10px] border-muted-foreground/50">
              LOCKED
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              ARM Live to view Coinbase positions
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Paper data is never shown here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ERROR state - armed but fetch failed
  if (hasFetchError || hasApiError) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Live Positions
            </div>
            <Badge variant="destructive" className="text-[10px]">
              ERROR
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/60 mb-2" />
            <p className="text-xs text-destructive">
              Failed to fetch Coinbase data
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {hasApiError ? data?.error : (error as Error)?.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-3 h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ARMED state - show live data
  return (
    <Card className="bg-card border-chart-1/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-chart-1 animate-pulse" />
            Live Positions
          </div>
          <div className="flex items-center gap-2">
            <Badge className="text-[10px] bg-chart-1/20 text-chart-1 border-chart-1/30">
              COINBASE
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="h-6 px-2"
            >
              <RefreshCw className={cn('h-3 w-3', (isLoading || isRefreshing) && 'animate-spin')} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-xs text-muted-foreground text-center py-4">
            Fetching Coinbase balances...
          </div>
        )}
        
        {!isLoading && accounts.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            No positions with balance
          </div>
        )}
        
        {!isLoading && accounts.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {accounts.map((account) => (
              <div 
                key={account.id}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-chart-1/5 hover:bg-chart-1/10 transition-colors border border-chart-1/10"
              >
                <div className="flex items-center gap-2">
                  <div className="text-chart-1">
                    {getCurrencyIcon(account.currency)}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{account.currency}</div>
                    <div className="text-[10px] text-muted-foreground">{account.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-medium">
                    {formatBalance(account.available, account.currency)}
                  </div>
                  {account.hold > 0 && (
                    <div className="text-[10px] text-amber-500">
                      Hold: {formatBalance(account.hold, account.currency)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!isLoading && accounts.length > 0 && (
          <div className="pt-2 border-t border-chart-1/20">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Data source</span>
              <span className="text-chart-1 font-medium">Coinbase Live</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
