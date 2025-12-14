import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePaperAccount, usePaperOrders } from '@/hooks/usePaperTrading';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ArrowLeft, ShoppingCart, Filter, X } from 'lucide-react';

export default function OrdersPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const { data: systemState } = useSystemState();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  // Fetch all orders with extended limit
  const { data: orders = [] } = useQuery({
    queryKey: ['all-orders', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      const { data } = await supabase
        .from('paper_orders')
        .select('*')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(500);
      return data ?? [];
    },
    enabled: !!account?.id,
  });
  
  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (symbolFilter && !order.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading orders...</div>
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
          <h1 className="font-mono text-lg text-primary">Orders Workspace</h1>
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
            <div className="flex gap-4 flex-wrap">
              <div className="w-40">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="filled">Filled</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input 
                placeholder="Search symbol..."
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
                className="w-48"
              />
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground self-center">
                {filteredOrders.length} orders
              </span>
            </div>
          </CardContent>
        </Card>
        
        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="text-left py-3 px-2">Time</th>
                    <th className="text-left py-3 px-2">Side</th>
                    <th className="text-left py-3 px-2">Symbol</th>
                    <th className="text-right py-3 px-2">Qty</th>
                    <th className="text-right py-3 px-2">Type</th>
                    <th className="text-right py-3 px-2">Fill Price</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Agent</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                          {order.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 font-mono">{order.symbol}</td>
                      <td className="py-2 px-2 text-right font-mono">{order.qty.toFixed(6)}</td>
                      <td className="py-2 px-2 text-right">
                        <Badge variant="outline">{order.order_type}</Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {order.filled_price ? `$${order.filled_price.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-2">
                        <Badge 
                          variant={
                            order.status === 'filled' ? 'glow' : 
                            order.status === 'rejected' ? 'danger' : 
                            'outline'
                          }
                        >
                          {order.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {order.agent_id ? (
                          <Link 
                            to={`/agents/${order.agent_id}`}
                            className="text-primary hover:underline"
                          >
                            {order.agent_id.slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedOrder(order)}
                            >
                              Details
                            </Button>
                          </SheetTrigger>
                          <SheetContent>
                            <SheetHeader>
                              <SheetTitle className="font-mono">Order Details</SheetTitle>
                            </SheetHeader>
                            {selectedOrder && (
                              <div className="mt-6 space-y-4">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <span className="text-muted-foreground">Order ID:</span>
                                  <span className="font-mono text-xs">{selectedOrder.id}</span>
                                  
                                  <span className="text-muted-foreground">Symbol:</span>
                                  <span className="font-mono">{selectedOrder.symbol}</span>
                                  
                                  <span className="text-muted-foreground">Side:</span>
                                  <Badge variant={selectedOrder.side === 'buy' ? 'success' : 'danger'}>
                                    {selectedOrder.side.toUpperCase()}
                                  </Badge>
                                  
                                  <span className="text-muted-foreground">Quantity:</span>
                                  <span className="font-mono">{selectedOrder.qty}</span>
                                  
                                  <span className="text-muted-foreground">Status:</span>
                                  <Badge>{selectedOrder.status}</Badge>
                                  
                                  <span className="text-muted-foreground">Fill Price:</span>
                                  <span className="font-mono">
                                    {selectedOrder.filled_price ? `$${selectedOrder.filled_price}` : '—'}
                                  </span>
                                  
                                  <span className="text-muted-foreground">Created:</span>
                                  <span className="text-xs">
                                    {new Date(selectedOrder.created_at).toLocaleString()}
                                  </span>
                                  
                                  {selectedOrder.filled_at && (
                                    <>
                                      <span className="text-muted-foreground">Filled:</span>
                                      <span className="text-xs">
                                        {new Date(selectedOrder.filled_at).toLocaleString()}
                                      </span>
                                    </>
                                  )}
                                  
                                  <span className="text-muted-foreground">Generation:</span>
                                  {selectedOrder.generation_id ? (
                                    <Link 
                                      to={`/generations/${selectedOrder.generation_id}`}
                                      className="text-primary hover:underline text-xs font-mono"
                                    >
                                      {selectedOrder.generation_id.slice(0, 8)}
                                    </Link>
                                  ) : <span>—</span>}
                                  
                                  <span className="text-muted-foreground">Agent:</span>
                                  {selectedOrder.agent_id ? (
                                    <Link 
                                      to={`/agents/${selectedOrder.agent_id}`}
                                      className="text-primary hover:underline text-xs font-mono"
                                    >
                                      {selectedOrder.agent_id.slice(0, 8)}
                                    </Link>
                                  ) : <span>—</span>}
                                  
                                  {selectedOrder.reason && (
                                    <>
                                      <span className="text-muted-foreground">Reason:</span>
                                      <span className="text-xs">{selectedOrder.reason}</span>
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
