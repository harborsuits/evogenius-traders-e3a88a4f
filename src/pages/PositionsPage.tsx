import { Link, useNavigate } from 'react-router-dom';
import { usePaperAccount, usePaperPositions } from '@/hooks/usePaperTrading';
import { useMarketData } from '@/hooks/useEvoTraderData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Package, TrendingUp, TrendingDown } from 'lucide-react';

export default function PositionsPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: marketData = [] } = useMarketData();
  
  const positionMetrics = positions.map(pos => {
    const market = marketData.find(m => m.symbol === pos.symbol);
    const currentPrice = market?.price ?? pos.avg_entry_price;
    const value = pos.qty * currentPrice;
    const cost = pos.qty * pos.avg_entry_price;
    const unrealizedPnl = value - cost;
    const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;
    return { ...pos, currentPrice, value, unrealizedPnl, unrealizedPnlPct };
  });
  
  const activePositions = positionMetrics.filter(p => p.qty !== 0);
  const closedPositions = positionMetrics.filter(p => p.qty === 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading positions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1" />
          <h1 className="font-mono text-lg text-primary">Positions Workspace</h1>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Open Positions */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Open Positions ({activePositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activePositions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No open positions
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-3 px-2">Symbol</th>
                      <th className="text-right py-3 px-2">Quantity</th>
                      <th className="text-right py-3 px-2">Avg Entry</th>
                      <th className="text-right py-3 px-2">Current Price</th>
                      <th className="text-right py-3 px-2">Market Value</th>
                      <th className="text-right py-3 px-2">Unrealized P&L</th>
                      <th className="text-right py-3 px-2">P&L %</th>
                      <th className="text-right py-3 px-2">Realized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePositions.map(pos => (
                      <tr key={pos.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-2">
                          <span className="font-mono font-medium">{pos.symbol}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">{pos.qty.toFixed(6)}</td>
                        <td className="py-3 px-2 text-right font-mono">${pos.avg_entry_price.toFixed(2)}</td>
                        <td className="py-3 px-2 text-right font-mono">${pos.currentPrice.toFixed(2)}</td>
                        <td className="py-3 px-2 text-right font-mono">${pos.value.toFixed(2)}</td>
                        <td className={`py-3 px-2 text-right font-mono ${pos.unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {pos.unrealizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                          </div>
                        </td>
                        <td className={`py-3 px-2 text-right font-mono ${pos.unrealizedPnlPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pos.unrealizedPnlPct >= 0 ? '+' : ''}{pos.unrealizedPnlPct.toFixed(2)}%
                        </td>
                        <td className={`py-3 px-2 text-right font-mono ${pos.realized_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pos.realized_pnl >= 0 ? '+' : ''}${pos.realized_pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Closed Positions */}
        {closedPositions.length > 0 && (
          <Card className="opacity-75">
            <CardHeader>
              <CardTitle className="font-mono text-sm flex items-center gap-2 text-muted-foreground">
                <Package className="h-4 w-4" />
                Closed Positions ({closedPositions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-3 px-2">Symbol</th>
                      <th className="text-right py-3 px-2">Realized P&L</th>
                      <th className="text-right py-3 px-2">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map(pos => (
                      <tr key={pos.id} className="border-b border-border/50">
                        <td className="py-3 px-2 font-mono">{pos.symbol}</td>
                        <td className={`py-3 px-2 text-right font-mono ${pos.realized_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {pos.realized_pnl >= 0 ? '+' : ''}${pos.realized_pnl.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right text-muted-foreground">
                          {new Date(pos.updated_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
