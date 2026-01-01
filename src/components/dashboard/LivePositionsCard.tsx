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
  TrendingUp,
  TrendingDown,
  PieChart,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['live-positions-coinbase'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data as { ok: boolean; accounts?: CoinbaseAccount[]; error?: string };
    },
    enabled: isArmed,
    staleTime: 10000,
    refetchInterval: isArmed ? 15000 : false,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Calculate exposure metrics
  const exposureMetrics = useMemo(() => {
    const accounts = (data?.accounts || []).filter(a => a.total > 0);
    const usdAccount = accounts.find(a => a.currency === 'USD');
    const nonUsdAccounts = accounts.filter(a => a.currency !== 'USD');
    
    const cashAvailable = usdAccount?.available ?? 0;
    const cashHold = usdAccount?.hold ?? 0;
    const totalCash = cashAvailable + cashHold;
    
    // For now, estimate non-USD positions value (would need price feed for accurate)
    // This is a simplified view - shows raw crypto amounts
    const cryptoPositions = nonUsdAccounts.map(a => ({
      currency: a.currency,
      size: a.total,
      available: a.available,
      hold: a.hold,
    }));
    
    // Calculate concentration (top position as % of total crypto holdings)
    const totalPositions = cryptoPositions.length;
    const topPosition = cryptoPositions.length > 0 
      ? cryptoPositions.reduce((max, p) => p.size > max.size ? p : max, cryptoPositions[0])
      : null;
    
    // Stale check - if data is older than 60 seconds
    const isStale = dataUpdatedAt ? (Date.now() - dataUpdatedAt) > 60000 : true;
    const lastSync = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
    
    return {
      cashAvailable,
      cashHold,
      totalCash,
      cryptoPositions,
      totalPositions,
      topPosition,
      isStale,
      lastSync,
      accounts,
    };
  }, [data, dataUpdatedAt]);

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

  // LOCKED state
  if (!isArmed) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Live Positions & Exposure
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
          </div>
        </CardContent>
      </Card>
    );
  }

  // ERROR state
  if (isError || (data && !data.ok)) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Live Positions & Exposure
            </div>
            <Badge variant="destructive" className="text-[10px]">ERROR</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/60 mb-2" />
            <p className="text-xs text-destructive">Failed to fetch Coinbase data</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {data?.error || (error as Error)?.message}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 h-7 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { cashAvailable, cashHold, cryptoPositions, isStale, lastSync, accounts } = exposureMetrics;

  // ARMED state - show live data with exposure
  return (
    <Card className={cn("bg-card", isStale ? "border-amber-500/50" : "border-chart-1/50")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className={cn("h-4 w-4", isStale ? "text-amber-500" : "text-chart-1 animate-pulse")} />
            Live Positions & Exposure
          </div>
          <div className="flex items-center gap-2">
            {isStale && (
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">
                STALE
              </Badge>
            )}
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
        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            Fetching Coinbase balances...
          </div>
        ) : (
          <>
            {/* Cash Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-chart-1/5 border border-chart-1/10">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Available Cash
                </div>
                <div className="text-sm font-mono font-semibold text-chart-1">
                  {formatBalance(cashAvailable, 'USD')}
                </div>
              </div>
              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Cash on Hold
                </div>
                <div className="text-sm font-mono font-semibold text-amber-500">
                  {formatBalance(cashHold, 'USD')}
                </div>
              </div>
            </div>

            {/* Exposure Summary */}
            <div className="p-2 rounded bg-muted/30 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <PieChart className="h-3 w-3" />
                  Crypto Exposure
                </span>
                <span className="text-[10px] font-medium">
                  {cryptoPositions.length} position{cryptoPositions.length !== 1 ? 's' : ''}
                </span>
              </div>
              {cryptoPositions.length > 0 && exposureMetrics.topPosition && (
                <div className="text-[10px] text-muted-foreground">
                  Top: <span className="text-foreground font-medium">{exposureMetrics.topPosition.currency}</span>
                  {cryptoPositions.length > 1 && (
                    <span className="text-amber-500 ml-1">(concentration warning if 1 asset)</span>
                  )}
                </div>
              )}
            </div>

            {/* Positions List */}
            {accounts.length > 0 ? (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {accounts.map((account) => (
                  <div 
                    key={account.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-chart-1/5 hover:bg-chart-1/10 transition-colors border border-chart-1/10"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-chart-1">{getCurrencyIcon(account.currency)}</div>
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
            ) : (
              <div className="text-xs text-muted-foreground text-center py-2">
                No positions with balance
              </div>
            )}

            {/* Sync Info */}
            <div className="pt-2 border-t border-chart-1/20 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Last sync</span>
              <span className={cn(isStale ? "text-amber-500" : "text-chart-1")}>
                {lastSync ? formatDistanceToNow(lastSync, { addSuffix: true }) : 'never'}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
