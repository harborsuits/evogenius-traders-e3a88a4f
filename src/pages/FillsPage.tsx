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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ArrowLeft, Activity, Filter } from 'lucide-react';

export default function FillsPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [selectedFill, setSelectedFill] = useState<any>(null);
  
  // Fetch fills with order info
  const { data: fills = [] } = useQuery({
    queryKey: ['all-fills', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, generation_id')
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
  
  const filteredFills = fills.filter(fill => {
    if (symbolFilter && !fill.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading fills...</div>
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
          <h1 className="font-mono text-lg text-primary">Fills / Trades Workspace</h1>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
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
                {filteredFills.length} fills
              </span>
            </div>
          </CardContent>
        </Card>
        
        {/* Fills Table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Execution History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
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
                    <th className="text-left py-3 px-2">Actions</th>
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
                      <td className="py-2 px-2">
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedFill(fill)}
                            >
                              Details
                            </Button>
                          </SheetTrigger>
                          <SheetContent>
                            <SheetHeader>
                              <SheetTitle className="font-mono">Fill Details</SheetTitle>
                            </SheetHeader>
                            {selectedFill && (
                              <div className="mt-6 space-y-4">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <span className="text-muted-foreground">Fill ID:</span>
                                  <span className="font-mono text-xs">{selectedFill.id}</span>
                                  
                                  <span className="text-muted-foreground">Order ID:</span>
                                  <Link 
                                    to={`/orders`}
                                    className="font-mono text-xs text-primary hover:underline"
                                  >
                                    {selectedFill.order_id.slice(0, 8)}
                                  </Link>
                                  
                                  <span className="text-muted-foreground">Symbol:</span>
                                  <span className="font-mono">{selectedFill.symbol}</span>
                                  
                                  <span className="text-muted-foreground">Side:</span>
                                  <Badge variant={selectedFill.side === 'buy' ? 'success' : 'danger'}>
                                    {selectedFill.side.toUpperCase()}
                                  </Badge>
                                  
                                  <span className="text-muted-foreground">Quantity:</span>
                                  <span className="font-mono">{selectedFill.qty}</span>
                                  
                                  <span className="text-muted-foreground">Price:</span>
                                  <span className="font-mono">${selectedFill.price}</span>
                                  
                                  <span className="text-muted-foreground">Value:</span>
                                  <span className="font-mono">
                                    ${(selectedFill.qty * selectedFill.price).toFixed(2)}
                                  </span>
                                  
                                  <span className="text-muted-foreground">Fee:</span>
                                  <span className="font-mono">${selectedFill.fee}</span>
                                  
                                  <span className="text-muted-foreground">Timestamp:</span>
                                  <span className="text-xs">
                                    {new Date(selectedFill.timestamp).toLocaleString()}
                                  </span>
                                  
                                  {selectedFill.order?.generation_id && (
                                    <>
                                      <span className="text-muted-foreground">Generation:</span>
                                      <Link 
                                        to={`/generations/${selectedFill.order.generation_id}`}
                                        className="text-primary hover:underline text-xs font-mono"
                                      >
                                        {selectedFill.order.generation_id.slice(0, 8)}
                                      </Link>
                                    </>
                                  )}
                                  
                                  {selectedFill.order?.agent_id && (
                                    <>
                                      <span className="text-muted-foreground">Agent:</span>
                                      <Link 
                                        to={`/agents/${selectedFill.order.agent_id}`}
                                        className="text-primary hover:underline text-xs font-mono"
                                      >
                                        {selectedFill.order.agent_id.slice(0, 8)}
                                      </Link>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </SheetContent>
                        </Sheet>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
