// Drillable Card Content Components - Compact summaries that link to full pages
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { useGenerationHistory } from '@/hooks/useEvoTraderData';
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
  Bell,
  Zap,
  Lock
} from 'lucide-react';

// Portfolio Card Content - Uses unified hook for Paper/Live data
export function PortfolioCardContent({ compact }: { compact?: boolean }) {
  const { summary, positions, dataSource, isPaper, errorMessage, refetchCoinbase } = usePortfolioData();
  
  const { totalEquity, totalPnl, totalPnlPct } = summary;
  const isLocked = dataSource === 'locked';
  const isError = dataSource === 'error';

  // Data source badge renderer
  const DataSourceBadge = () => {
    switch (dataSource) {
      case 'paper':
        return <Badge variant="outline" className="text-[10px] font-mono">PAPER</Badge>;
      case 'coinbase':
        return (
          <Badge variant="glow" className="text-[10px] font-mono flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" />COINBASE
          </Badge>
        );
      case 'locked':
        return <Badge variant="destructive" className="text-[10px] font-mono">LOCKED</Badge>;
      case 'error':
        return <Badge variant="destructive" className="text-[10px] font-mono">ERROR</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      {/* Data source indicator - explicit label */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Source</span>
        <DataSourceBadge />
      </div>
      
      {isLocked ? (
        // LOCKED state - show placeholder, no paper data
        <div className="text-center py-6 text-muted-foreground">
          <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">ARM required to view live data</p>
          <p className="text-[10px] mt-1 opacity-70">Enable ARM (60s) to unlock</p>
        </div>
      ) : isError ? (
        // ERROR state - show error message and retry
        <div className="text-center py-6 text-destructive">
          <p className="text-xs font-medium">Coinbase fetch failed</p>
          <p className="text-[10px] mt-1 opacity-70 text-muted-foreground">{errorMessage || 'Unknown error'}</p>
          {refetchCoinbase && (
            <button 
              onClick={() => refetchCoinbase()}
              className="mt-2 text-[10px] underline hover:no-underline"
            >
              Retry fetch
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span className="text-xs">Total Equity</span>
            </div>
            <div className="font-mono font-bold">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          
          {isPaper && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total P&L</span>
              <div className={`font-mono ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
              </div>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span>{positions.length} positions</span>
            <span className="mx-2">•</span>
            <span>Click to view details →</span>
          </div>
        </>
      )}
    </div>
  );
}

// Positions Card Content - Uses unified hook for Paper/Live data
export function PositionsCardContent({ compact }: { compact?: boolean }) {
  const { positions, dataSource, isPaper, errorMessage, refetchCoinbase } = usePortfolioData();
  const isLocked = dataSource === 'locked';
  const isError = dataSource === 'error';

  const SourceBadge = () => {
    switch (dataSource) {
      case 'paper': return <Badge variant="outline" className="text-[10px] font-mono">PAPER</Badge>;
      case 'coinbase': return <Badge variant="glow" className="text-[10px] font-mono flex items-center gap-1"><Zap className="h-2.5 w-2.5" />COINBASE</Badge>;
      case 'locked': return <Badge variant="destructive" className="text-[10px] font-mono">LOCKED</Badge>;
      case 'error': return <Badge variant="destructive" className="text-[10px] font-mono">ERROR</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Package className="h-4 w-4" />
          <span className="text-xs">{isLocked || isError ? 'Positions' : `${positions.length} Open`}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-muted-foreground uppercase">src:</span>
          <SourceBadge />
        </div>
      </div>
      
      {isLocked ? (
        <div className="text-center py-4 text-muted-foreground">
          <Lock className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">ARM to view positions</p>
        </div>
      ) : isError ? (
        <div className="text-center py-4 text-destructive">
          <p className="text-xs">Fetch failed</p>
          {refetchCoinbase && (
            <button onClick={() => refetchCoinbase()} className="mt-1 text-[10px] underline">Retry</button>
          )}
        </div>
      ) : positions.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No open positions
        </div>
      ) : (
        <ScrollArea className="max-h-[100px]">
          <div className="space-y-1">
            {positions.slice(0, 5).map(pos => (
              <div key={pos.id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{pos.symbol}</span>
                {isPaper ? (
                  <span className={pos.unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'}>
                    {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                  </span>
                ) : (
                  <span className="font-mono text-muted-foreground">
                    {pos.qty.toFixed(4)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
        Click to view all positions →
      </div>
    </div>
  );
}

// Orders Card Content - Uses unified hook
export function OrdersCardContent({ compact }: { compact?: boolean }) {
  const { orders, dataSource, isPaper, errorMessage, refetchCoinbase } = usePortfolioData();
  const isLocked = dataSource === 'locked';
  const isError = dataSource === 'error';

  const SourceBadge = () => {
    switch (dataSource) {
      case 'paper': return <Badge variant="outline" className="text-[10px] font-mono">PAPER</Badge>;
      case 'coinbase': return <Badge variant="glow" className="text-[10px] font-mono flex items-center gap-1"><Zap className="h-2.5 w-2.5" />COINBASE</Badge>;
      case 'locked': return <Badge variant="destructive" className="text-[10px] font-mono">LOCKED</Badge>;
      case 'error': return <Badge variant="destructive" className="text-[10px] font-mono">ERROR</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShoppingCart className="h-4 w-4" />
          <span className="text-xs">Orders</span>
          {!isLocked && !isError && <Badge variant="secondary" className="text-[10px]">{orders.length}</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-muted-foreground uppercase">src:</span>
          <SourceBadge />
        </div>
      </div>
      
      {isLocked ? (
        <div className="text-center py-4 text-muted-foreground">
          <Lock className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">ARM to view orders</p>
        </div>
      ) : isError ? (
        <div className="text-center py-4 text-destructive">
          <p className="text-xs">Fetch failed</p>
          {refetchCoinbase && (
            <button onClick={() => refetchCoinbase()} className="mt-1 text-[10px] underline">Retry</button>
          )}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          {dataSource === 'coinbase' ? 'Live orders not tracked here' : 'No orders yet'}
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
                {order.status === 'filled' && order.filledPrice ? (
                  <span className="font-mono text-muted-foreground">${order.filledPrice.toLocaleString()}</span>
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

// Activity Card Content - Uses unified hook, shows Paper activity or Live message
export function ActivityCardContent({ compact }: { compact?: boolean }) {
  const { orders, dataSource, isPaper, errorMessage, refetchCoinbase } = usePortfolioData();
  const isLocked = dataSource === 'locked';
  const isError = dataSource === 'error';

  const SourceBadge = () => {
    switch (dataSource) {
      case 'paper': return <Badge variant="outline" className="text-[10px] font-mono">PAPER</Badge>;
      case 'coinbase': return <Badge variant="glow" className="text-[10px] font-mono flex items-center gap-1"><Zap className="h-2.5 w-2.5" />COINBASE</Badge>;
      case 'locked': return <Badge variant="destructive" className="text-[10px] font-mono">LOCKED</Badge>;
      case 'error': return <Badge variant="destructive" className="text-[10px] font-mono">ERROR</Badge>;
    }
  };

  // LOCKED state - show placeholder
  if (isLocked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-muted-foreground uppercase">src:</span>
            <SourceBadge />
          </div>
        </div>
        
        <div className="text-center py-4 text-muted-foreground">
          <Lock className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-xs">ARM to view activity</p>
        </div>
        
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          Click to view trades →
        </div>
      </div>
    );
  }

  // ERROR state
  if (isError) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-muted-foreground uppercase">src:</span>
            <SourceBadge />
          </div>
        </div>
        
        <div className="text-center py-4 text-destructive">
          <p className="text-xs">Fetch failed</p>
          {refetchCoinbase && (
            <button onClick={() => refetchCoinbase()} className="mt-1 text-[10px] underline">Retry</button>
          )}
        </div>
        
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          Click to view trades →
        </div>
      </div>
    );
  }

  // For live mode armed (dataSource === 'coinbase')
  if (dataSource === 'coinbase') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-muted-foreground uppercase">src:</span>
            <SourceBadge />
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground text-center py-4">
          Live activity shown on Coinbase
        </div>
        
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          Click to view trades →
        </div>
      </div>
    );
  }

  // Paper mode - show orders as activity
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span className="text-xs">Activity</span>
          <Badge variant="secondary" className="text-[10px]">{orders.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-muted-foreground uppercase">src:</span>
          <Badge variant="outline" className="text-[10px] font-mono">PAPER</Badge>
        </div>
      </div>
      
      {orders.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No activity yet
        </div>
      ) : (
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {orders.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={item.side === 'buy' ? 'success' : 'danger'} className="text-[10px] px-1">
                    {item.side.toUpperCase()}
                  </Badge>
                  <span className="font-mono">{item.symbol}</span>
                </div>
                {item.filledPrice ? (
                  <span className="font-mono text-muted-foreground">${item.filledPrice.toLocaleString()}</span>
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
