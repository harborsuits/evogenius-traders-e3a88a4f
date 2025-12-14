import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  usePaperAccount, 
  usePaperPositions, 
  usePaperOrders,
  usePaperRealtimeSubscriptions 
} from '@/hooks/usePaperTrading';
import { useMarketData } from '@/hooks/useEvoTraderData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  BarChart3,
  Package,
  ShoppingCart,
  Activity
} from 'lucide-react';

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: orders = [] } = usePaperOrders(account?.id, 50);
  const { data: marketData = [] } = useMarketData();
  
  usePaperRealtimeSubscriptions();
  
  const cash = account?.cash ?? 0;
  const startingCash = account?.starting_cash ?? 1000;
  
  // Calculate position metrics
  const positionMetrics = positions.map(pos => {
    const market = marketData.find(m => m.symbol === pos.symbol);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orbit
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">Portfolio & Positions</h1>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Wallet className="h-4 w-4" />
                <span className="text-xs">Total Equity</span>
              </div>
              <div className="font-mono text-2xl font-bold">
                ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Cash</span>
              </div>
              <div className="font-mono text-2xl">
                ${cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs">Unrealized P&L</span>
              </div>
              <div className={`font-mono text-2xl ${totalUnrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span className="text-xs">Total P&L</span>
              </div>
              <div className={`font-mono text-2xl font-bold ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                <span className="text-sm ml-1">({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Quick Links */}
        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link to="/positions">
              <Package className="h-4 w-4 mr-2" />
              View Positions ({positions.filter(p => p.qty !== 0).length})
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/orders">
              <ShoppingCart className="h-4 w-4 mr-2" />
              View Orders
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/fills">
              <Activity className="h-4 w-4 mr-2" />
              View Fills
            </Link>
          </Button>
        </div>
        
        {/* Positions Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {positionMetrics.filter(p => p.qty !== 0).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No open positions
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2">Symbol</th>
                      <th className="text-right py-2">Qty</th>
                      <th className="text-right py-2">Avg Entry</th>
                      <th className="text-right py-2">Current</th>
                      <th className="text-right py-2">Value</th>
                      <th className="text-right py-2">P&L</th>
                      <th className="text-right py-2">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionMetrics.filter(p => p.qty !== 0).map(pos => (
                      <tr key={pos.id} className="border-b border-border/50">
                        <td className="py-2 font-mono font-medium">{pos.symbol}</td>
                        <td className="py-2 text-right font-mono">{pos.qty.toFixed(6)}</td>
                        <td className="py-2 text-right font-mono">${pos.avg_entry_price.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono">${pos.currentPrice.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono">${pos.value.toFixed(2)}</td>
                        <td className={`py-2 text-right font-mono ${pos.unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                        </td>
                        <td className={`py-2 text-right font-mono ${pos.unrealizedPnlPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pos.unrealizedPnlPct >= 0 ? '+' : ''}{pos.unrealizedPnlPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {orders.slice(0, 20).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm">
                    <div className="flex items-center gap-3">
                      <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                        {order.side.toUpperCase()}
                      </Badge>
                      <span className="font-mono">{order.symbol}</span>
                      <span className="text-muted-foreground">{order.qty.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{order.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
