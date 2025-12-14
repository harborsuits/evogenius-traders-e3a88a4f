import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePaperAccount } from '@/hooks/usePaperTrading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Activity, 
  Filter, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Clock
} from 'lucide-react';

export default function TradesPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  
  // Fetch fills with order info
  const { data: fills = [] } = useQuery({
    queryKey: ['all-fills', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, generation_id, side, symbol, status, created_at')
        .eq('account_id', account.id);
      
      if (!orders?.length) return [];
      
      const orderMap = new Map(orders.map(o => [o.id, o]));
      
      const { data } = await supabase
        .from('paper_fills')
        .select('*')
        .in('order_id', orders.map(o => o.id))
        .order('timestamp', { ascending: false })
        .limit(500);
      
      return (data ?? []).map(fill => ({
        ...fill,
        order: orderMap.get(fill.order_id),
      }));
    },
    enabled: !!account?.id,
  });
  
  // Summary stats (matching card metrics)
  const totalFills = fills.length;
  const buyFills = fills.filter(f => f.side === 'buy');
  const sellFills = fills.filter(f => f.side === 'sell');
  const totalVolume = fills.reduce((sum, f) => sum + (f.qty * f.price), 0);
  const totalFees = fills.reduce((sum, f) => sum + f.fee, 0);
  
  const filteredFills = fills.filter(fill => {
    if (symbolFilter && !fill.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading trades...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Title bar matching design language */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orbit
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">Trades & Fills</h1>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Key metrics - matching tile summary for visual continuity */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Total Fills</span>
              </div>
              <div className="font-mono text-2xl font-bold">{totalFills}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs">Buys</span>
              </div>
              <div className="font-mono text-2xl text-success">{buyFills.length}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs">Sells</span>
              </div>
              <div className="font-mono text-2xl text-destructive">{sellFills.length}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Volume</span>
              </div>
              <div className="font-mono text-2xl">${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input 
                placeholder="Search symbol..."
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
                className="w-48"
              />
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground self-center">
                {filteredFills.length} fills • ${totalFees.toFixed(2)} fees
              </span>
            </div>
          </CardContent>
        </Card>
        
        {/* Fills Table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Execution History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="text-left py-3 px-2">Timestamp</th>
                    <th className="text-left py-3 px-2">Side</th>
                    <th className="text-left py-3 px-2">Symbol</th>
                    <th className="text-right py-3 px-2">Qty</th>
                    <th className="text-right py-3 px-2">Price</th>
                    <th className="text-right py-3 px-2">Value</th>
                    <th className="text-right py-3 px-2">Fee</th>
                    <th className="text-left py-3 px-2">Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFills.map((fill: any) => (
                    <tr key={fill.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {new Date(fill.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={fill.side === 'buy' ? 'success' : 'danger'}>
                          {fill.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 font-mono">{fill.symbol}</td>
                      <td className="py-2 px-2 text-right font-mono">{fill.qty.toFixed(6)}</td>
                      <td className="py-2 px-2 text-right font-mono">${fill.price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono">
                        ${(fill.qty * fill.price).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                        ${fill.fee.toFixed(4)}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {fill.order?.agent_id ? (
                          <Link 
                            to={`/agents/${fill.order.agent_id}`}
                            className="text-primary hover:underline"
                          >
                            {fill.order.agent_id.slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredFills.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        No fills recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
