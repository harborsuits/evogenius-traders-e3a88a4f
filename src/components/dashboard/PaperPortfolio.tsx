import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  usePaperAccount,
  usePaperPositions,
  usePaperOrders,
  usePaperRealtimeSubscriptions,
  resetPaperAccount,
} from '@/hooks/usePaperTrading';
import { useMarketData } from '@/hooks/useEvoTraderData';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  RotateCcw,
  FlaskConical,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { useState } from 'react';

export function PaperPortfolio() {
  const { data: account, isLoading: loadingAccount } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: orders = [] } = usePaperOrders(account?.id, 10);
  const { data: marketData = [] } = useMarketData();
  const [resetting, setResetting] = useState(false);
  const queryClient = useQueryClient();

  // Enable realtime subscriptions
  usePaperRealtimeSubscriptions();

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetPaperAccount();
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('paper') });
      toast({
        title: 'Paper Account Reset',
        description: `Cash restored to $${account?.starting_cash?.toLocaleString() ?? '1,000'}`,
      });
    } catch (err) {
      console.error('[PaperPortfolio] Reset error:', err);
      toast({
        title: 'Reset Failed',
        description: 'Could not reset paper account.',
        variant: 'destructive',
      });
    } finally {
      setResetting(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0]?.toString().includes('paper') });
  };

  // Calculate metrics
  const cash = account?.cash ?? 0;
  const startingCash = account?.starting_cash ?? 1000;

  // Calculate position values and unrealized P&L
  const positionMetrics = positions.map((pos) => {
    const market = marketData.find((m) => m.symbol === pos.symbol);
    const currentPrice = market?.price ?? pos.avg_entry_price;
    const value = pos.qty * currentPrice;
    const cost = pos.qty * pos.avg_entry_price;
    const unrealizedPnl = value - cost;
    const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;
    return { ...pos, currentPrice, value, unrealizedPnl, unrealizedPnlPct };
  });

  const totalPositionValue = positionMetrics.reduce((sum, p) => sum + p.value, 0);
  const totalEquity = cash + totalPositionValue;
  const totalUnrealizedPnl = positionMetrics.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalRealizedPnl = positions.reduce((sum, p) => sum + p.realized_pnl, 0);
  const totalPnl = totalEquity - startingCash;
  const totalPnlPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;

  if (loadingAccount) {
    return (
      <Card variant="terminal" className="border-primary/20">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="terminal" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
              Paper Portfolio
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Paper Account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset your cash to ${startingCash.toLocaleString()} and clear all positions and orders. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} disabled={resetting}>
                    {resetting ? 'Resetting...' : 'Reset'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Total Equity
            </div>
            <div className="font-mono text-lg font-bold">${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Cash
            </div>
            <div className="font-mono text-lg">${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Unrealized P&L
            </div>
            <div className={`font-mono text-lg ${totalUnrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {totalPnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              Total P&L
            </div>
            <div className={`font-mono text-lg font-bold ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              <span className="text-xs ml-1">({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* Positions */}
        {positionMetrics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Positions</div>
            <ScrollArea className="max-h-[120px]">
              <div className="space-y-2">
                {positionMetrics.map((pos) => (
                  <div
                    key={pos.id}
                    className="flex items-center justify-between bg-muted/20 rounded-lg p-2 text-sm"
                  >
                    <div>
                      <span className="font-mono font-medium">{pos.symbol}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {pos.qty.toFixed(6)} @ ${pos.avg_entry_price.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">${pos.value.toFixed(2)}</div>
                      <div className={`text-xs ${pos.unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnlPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Recent Orders */}
        {orders.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Recent Orders</div>
            <ScrollArea className="max-h-[100px]">
              <div className="space-y-1">
                {orders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={order.side === 'buy' ? 'success' : 'danger'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {order.side.toUpperCase()}
                      </Badge>
                      <span className="font-mono">{order.symbol}</span>
                      <span className="text-muted-foreground">{order.qty.toFixed(6)}</span>
                    </div>
                    <Badge
                      variant={
                        order.status === 'filled'
                          ? 'glow'
                          : order.status === 'rejected'
                          ? 'danger'
                          : 'outline'
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      {order.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {positions.length === 0 && orders.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No positions or orders yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
