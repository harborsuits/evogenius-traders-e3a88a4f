// Drillable Card Content Components - Compact summaries that link to full pages
import { 
  usePaperAccount, 
  usePaperPositions, 
  usePaperOrders,
  usePaperRealtimeSubscriptions 
} from '@/hooks/usePaperTrading';
import { useMarketData, useGenerationHistory } from '@/hooks/useEvoTraderData';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ShoppingCart,
  Trophy,
  History,
  Activity,
  Bell
} from 'lucide-react';

// Portfolio Card Content
export function PortfolioCardContent({ compact }: { compact?: boolean }) {
  const { data: account } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: marketData = [] } = useMarketData();
  
  usePaperRealtimeSubscriptions();
  
  const cash = account?.cash ?? 0;
  const startingCash = account?.starting_cash ?? 1000;
  
  const positionValues = positions.map(pos => {
    const market = marketData.find(m => m.symbol === pos.symbol);
    return pos.qty * (market?.price ?? pos.avg_entry_price);
  });
  
  const totalPositionValue = positionValues.reduce((sum, v) => sum + v, 0);
  const totalEquity = cash + totalPositionValue;
  const totalPnl = totalEquity - startingCash;
  const pnlPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="h-4 w-4" />
          <span className="text-xs">Total Equity</span>
        </div>
        <div className="font-mono font-bold">
          ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total P&L</span>
        <div className={`font-mono ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
          {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        <span>{positions.length} positions</span>
        <span className="mx-2">•</span>
        <span>Click to view details →</span>
      </div>
    </div>
  );
}

// Positions Card Content
export function PositionsCardContent({ compact }: { compact?: boolean }) {
  const { data: account } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: marketData = [] } = useMarketData();
  
  const activePositions = positions.filter(p => p.qty !== 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Package className="h-4 w-4" />
        <span className="text-xs">{activePositions.length} Open Positions</span>
      </div>
      
      {activePositions.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No open positions
        </div>
      ) : (
        <ScrollArea className="max-h-[100px]">
          <div className="space-y-1">
            {activePositions.slice(0, 5).map(pos => {
              const market = marketData.find(m => m.symbol === pos.symbol);
              const currentPrice = market?.price ?? pos.avg_entry_price;
              const unrealizedPnl = pos.qty * (currentPrice - pos.avg_entry_price);
              
              return (
                <div key={pos.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{pos.symbol}</span>
                  <span className={unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}>
                    {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all positions →
      </div>
    </div>
  );
}

// Orders Card Content
export function OrdersCardContent({ compact }: { compact?: boolean }) {
  const { data: account } = usePaperAccount();
  const { data: orders = [] } = usePaperOrders(account?.id, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ShoppingCart className="h-4 w-4" />
        <span className="text-xs">Recent Orders</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{orders.length}</Badge>
      </div>
      
      {orders.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No orders yet
        </div>
      ) : (
        <ScrollArea className="max-h-[100px]">
          <div className="space-y-1">
            {orders.slice(0, 5).map(order => (
              <div key={order.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={order.side === 'buy' ? 'success' : 'danger'} className="text-[10px] px-1">
                    {order.side.toUpperCase()}
                  </Badge>
                  <span className="font-mono">{order.symbol}</span>
                </div>
                {order.status === 'filled' && order.filled_price ? (
                  <span className="font-mono text-muted-foreground">${order.filled_price.toLocaleString()}</span>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all orders →
      </div>
    </div>
  );
}

// Activity Card Content - Combined Orders + Fills
export function ActivityCardContent({ compact }: { compact?: boolean }) {
  const { data: account } = usePaperAccount();
  
  const { data: activity = [] } = useQuery({
    queryKey: ['recent-activity', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      
      // Get recent orders
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, side, symbol, status, filled_price, created_at')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      // Get recent fills
      const { data: fills } = await supabase
        .from('paper_fills')
        .select('id, side, symbol, price, timestamp')
        .order('timestamp', { ascending: false })
        .limit(10);
      
      // Combine and sort chronologically
      const combined = [
        ...(orders || []).map(o => ({
          id: o.id,
          type: 'order' as const,
          side: o.side,
          symbol: o.symbol,
          price: o.filled_price,
          status: o.status,
          time: o.created_at,
        })),
        ...(fills || []).map(f => ({
          id: f.id,
          type: 'fill' as const,
          side: f.side,
          symbol: f.symbol,
          price: f.price,
          status: 'filled',
          time: f.timestamp,
        })),
      ];
      
      // Sort by time descending and dedupe (fills often duplicate orders)
      return combined
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 8);
    },
    enabled: !!account?.id,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Activity className="h-4 w-4" />
        <span className="text-xs">Recent Activity</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{activity.length}</Badge>
      </div>
      
      {activity.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No activity yet
        </div>
      ) : (
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {activity.slice(0, 6).map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={item.side === 'buy' ? 'success' : 'danger'} className="text-[10px] px-1">
                    {item.side.toUpperCase()}
                  </Badge>
                  <span className="font-mono">{item.symbol}</span>
                </div>
                {item.price ? (
                  <span className="font-mono text-muted-foreground">${item.price.toLocaleString()}</span>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all activity →
      </div>
    </div>
  );
}

// Agents Card Content
export function AgentsCardContent({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  
  const { data: topAgents = [] } = useQuery({
    queryKey: ['top-agents-summary', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return [];
      
      const { data: cohort } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', systemState.current_generation_id);
      
      if (!cohort?.length) return [];
      
      const { data: agents } = await supabase
        .from('agents')
        .select('id, strategy_template, is_elite')
        .in('id', cohort.map(c => c.agent_id));
      
      const { data: perf } = await supabase
        .from('performance')
        .select('agent_id, fitness_score, net_pnl')
        .eq('generation_id', systemState.current_generation_id)
        .in('agent_id', cohort.map(c => c.agent_id));
      
      const perfMap = new Map(perf?.map(p => [p.agent_id, p]) || []);
      
      return (agents || [])
        .map(a => ({
          ...a,
          fitness: perfMap.get(a.id)?.fitness_score ?? null,
          pnl: perfMap.get(a.id)?.net_pnl ?? null,
        }))
        .sort((a, b) => (b.fitness ?? -999) - (a.fitness ?? -999))
        .slice(0, 5);
    },
    enabled: !!systemState?.current_generation_id,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Trophy className="h-4 w-4 text-yellow-500" />
        <span className="text-xs">Top Agents</span>
      </div>
      
      {topAgents.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No agents in cohort
        </div>
      ) : (
        <div className="space-y-1">
          {topAgents.map((agent: any, i) => (
            <div key={agent.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-4">#{i + 1}</span>
                <span className="font-mono">{agent.id.slice(0, 8)}</span>
                {agent.is_elite && <span className="text-yellow-500">★</span>}
              </div>
              {agent.fitness !== null && (
                <Badge variant="outline" className="text-[10px]">
                  {(agent.fitness * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view leaderboard →
      </div>
    </div>
  );
}

// Generations Card Content
export function GenerationsCardContent({ compact }: { compact?: boolean }) {
  const { data: generations = [] } = useGenerationHistory(5);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <History className="h-4 w-4" />
        <span className="text-xs">Generation History</span>
      </div>
      
      {generations.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No generations yet
        </div>
      ) : (
        <div className="space-y-1">
          {generations.slice(0, 5).map((gen: any) => (
            <div key={gen.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono">Gen #{gen.generation_number}</span>
                {gen.is_active && <Badge variant="glow" className="text-[10px]">ACTIVE</Badge>}
              </div>
              <span className={`font-mono ${gen.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${gen.total_pnl.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all generations →
      </div>
    </div>
  );
}

// Alerts Card Content
export function AlertsCardContent({ compact }: { compact?: boolean }) {
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts-summary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('performance_alerts')
        .select('*')
        .eq('is_ack', false)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const critCount = alerts.filter((a: any) => a.severity === 'crit').length;
  const warnCount = alerts.filter((a: any) => a.severity === 'warn').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Bell className="h-4 w-4 text-yellow-500" />
        <span className="text-xs">Performance Alerts</span>
        {alerts.length > 0 && (
          <Badge variant={critCount > 0 ? 'destructive' : 'warning'} className="text-[10px] ml-auto">
            {alerts.length}
          </Badge>
        )}
      </div>
      
      {alerts.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No active alerts
        </div>
      ) : (
        <ScrollArea className="max-h-[100px]">
          <div className="space-y-1">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={alert.severity === 'crit' ? 'destructive' : alert.severity === 'warn' ? 'warning' : 'secondary'} 
                    className="text-[10px] px-1"
                  >
                    {alert.severity.toUpperCase()}
                  </Badge>
                  <span className="font-mono truncate max-w-[140px]">{alert.title}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all alerts →
      </div>
    </div>
  );
}
