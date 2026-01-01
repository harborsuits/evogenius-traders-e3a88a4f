import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Lock,
  Radio,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

interface LiveOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'rejected' | 'pending';
  created_at: string;
  filled_at?: string;
  reject_reason?: string;
}

interface LiveFill {
  id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  fee: number;
  timestamp: string;
}

interface LiveOrdersFillsTileProps {
  isArmed: boolean;
}

export function LiveOrdersFillsTile({ isArmed }: LiveOrdersFillsTileProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<'orders' | 'fills'>('orders');

  // Fetch recent live orders from control_events
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['live-orders-recent'],
    queryFn: async () => {
      // Get live order events from control_events
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['live_order_placed', 'live_order_filled', 'live_order_rejected', 'live_order_cancelled'])
        .order('triggered_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      // Parse and group by order
      const orderMap = new Map<string, LiveOrder>();
      
      for (const event of data || []) {
        const meta = event.metadata as Record<string, unknown> | null;
        const orderId = meta?.order_id as string;
        if (!orderId) continue;
        
        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, {
            id: orderId,
            symbol: (meta?.symbol as string) || 'UNKNOWN',
            side: (meta?.side as 'buy' | 'sell') || 'buy',
            size: (meta?.size as number) || 0,
            price: (meta?.price as number) || null,
            status: 'pending',
            created_at: event.triggered_at,
          });
        }
        
        const order = orderMap.get(orderId)!;
        
        if (event.action === 'live_order_filled') {
          order.status = 'filled';
          order.filled_at = event.triggered_at;
          order.price = (meta?.fill_price as number) || order.price;
        } else if (event.action === 'live_order_rejected') {
          order.status = 'rejected';
          order.reject_reason = (meta?.reason as string) || 'Unknown';
        } else if (event.action === 'live_order_cancelled') {
          order.status = 'cancelled';
        } else if (event.action === 'live_order_placed') {
          if (order.status === 'pending') order.status = 'open';
        }
      }
      
      return Array.from(orderMap.values()).slice(0, 10);
    },
    enabled: isArmed,
    refetchInterval: isArmed ? 10000 : false,
  });

  // Fetch recent fills
  const { data: fillsData, isLoading: fillsLoading, refetch: refetchFills } = useQuery({
    queryKey: ['live-fills-recent'],
    queryFn: async () => {
      // Get fill events from control_events
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .eq('action', 'live_order_filled')
        .order('triggered_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      return (data || []).map(event => {
        const meta = event.metadata as Record<string, unknown> | null;
        return {
          id: event.id,
          order_id: (meta?.order_id as string) || '',
          symbol: (meta?.symbol as string) || 'UNKNOWN',
          side: (meta?.side as 'buy' | 'sell') || 'buy',
          size: (meta?.fill_size as number) || (meta?.size as number) || 0,
          price: (meta?.fill_price as number) || 0,
          fee: (meta?.fee as number) || 0,
          timestamp: event.triggered_at,
        } as LiveFill;
      });
    },
    enabled: isArmed,
    refetchInterval: isArmed ? 10000 : false,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchOrders(), refetchFills()]);
    setIsRefreshing(false);
  };

  const orders = ordersData || [];
  const fills = fillsData || [];
  const isLoading = ordersLoading || fillsLoading;

  const rejectedCount = orders.filter(o => o.status === 'rejected').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'filled': return <CheckCircle2 className="h-3 w-3 text-chart-1" />;
      case 'rejected': return <XCircle className="h-3 w-3 text-destructive" />;
      case 'cancelled': return <XCircle className="h-3 w-3 text-muted-foreground" />;
      case 'open': return <Clock className="h-3 w-3 text-amber-500" />;
      default: return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      filled: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
      rejected: 'bg-destructive/20 text-destructive border-destructive/30',
      cancelled: 'bg-muted text-muted-foreground border-border',
      open: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
      pending: 'bg-muted text-muted-foreground border-border',
    };
    return variants[status] || variants.pending;
  };

  // LOCKED state
  if (!isArmed) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Live Orders & Fills
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
              ARM Live to view order history
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card", rejectedCount > 0 ? "border-destructive/50" : "border-chart-1/50")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-chart-1 animate-pulse" />
            Live Orders & Fills
          </div>
          <div className="flex items-center gap-2">
            {rejectedCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {rejectedCount} REJECTED
              </Badge>
            )}
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
        {/* View Toggle */}
        <div className="flex gap-1 p-0.5 rounded bg-muted/50">
          <button
            onClick={() => setView('orders')}
            className={cn(
              "flex-1 text-[10px] py-1 rounded transition-colors",
              view === 'orders' ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Orders ({orders.length})
          </button>
          <button
            onClick={() => setView('fills')}
            className={cn(
              "flex-1 text-[10px] py-1 rounded transition-colors",
              view === 'fills' ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Fills ({fills.length})
          </button>
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            Loading...
          </div>
        ) : view === 'orders' ? (
          /* Orders View */
          orders.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              No live orders yet
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 border border-border"
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(order.status)}
                    <div className="flex items-center gap-1">
                      {order.side === 'buy' ? (
                        <ArrowUpRight className="h-3 w-3 text-chart-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-destructive" />
                      )}
                      <span className="text-xs font-medium">{order.symbol}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono">{order.size.toFixed(6)}</span>
                    <Badge className={cn("text-[9px] px-1", getStatusBadge(order.status))}>
                      {order.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Fills View */
          fills.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              No fills yet
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {fills.map((fill) => (
                <div 
                  key={fill.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-chart-1/5 border border-chart-1/10"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-chart-1" />
                    <div className="flex items-center gap-1">
                      {fill.side === 'buy' ? (
                        <ArrowUpRight className="h-3 w-3 text-chart-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-destructive" />
                      )}
                      <span className="text-xs font-medium">{fill.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono">
                      {fill.size.toFixed(6)} @ ${fill.price.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      Fee: ${fill.fee.toFixed(4)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Rejection Warnings */}
        {rejectedCount > 0 && (
          <div className="p-2 rounded bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-[10px] font-medium">
                {rejectedCount} order{rejectedCount > 1 ? 's' : ''} rejected
              </span>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              Check API permissions or rate limits
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}