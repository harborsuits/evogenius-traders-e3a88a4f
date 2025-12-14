import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { usePaperAccount } from '@/hooks/usePaperTrading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkline } from '@/components/ui/sparkline';
import { ArrowLeft, Users } from 'lucide-react';

type Timeframe = 'all' | '30d' | '7d';
type Position = { qty: number; costBasis: number };

export default function AgentComparePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ids = searchParams.get('ids')?.split(',').filter(Boolean) || [];
  const { data: systemState } = useSystemState();
  const { data: account } = usePaperAccount();
  const [timeframe, setTimeframe] = useState<Timeframe>('all');

  // Get timeframe filter dates
  const getTimeframeFilter = () => {
    const now = new Date();
    if (timeframe === '7d') {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '30d') {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return null;
  };

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['compare-agents', ids],
    queryFn: async () => {
      if (!ids.length) return [];
      const { data } = await supabase
        .from('agents')
        .select('*')
        .in('id', ids);
      return data || [];
    },
    enabled: ids.length > 0,
  });

  // Fetch performance
  const { data: performance = new Map() } = useQuery({
    queryKey: ['compare-performance', ids, systemState?.current_generation_id],
    queryFn: async () => {
      if (!ids.length || !systemState?.current_generation_id) return new Map();
      const { data } = await supabase
        .from('performance')
        .select('*')
        .eq('generation_id', systemState.current_generation_id)
        .in('agent_id', ids);
      return new Map((data || []).map(p => [p.agent_id, p]));
    },
    enabled: ids.length > 0 && !!systemState?.current_generation_id,
  });

  // Fetch fills for win rate and PnL calculations
  const { data: fillsData } = useQuery({
    queryKey: ['compare-fills', ids, account?.id, systemState?.current_generation_id],
    queryFn: async () => {
      if (!ids.length || !account?.id || !systemState?.current_generation_id) return { orders: [], fills: [] };
      
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, side, symbol, created_at')
        .eq('account_id', account.id)
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled')
        .in('agent_id', ids);

      if (!orders?.length) return { orders: [], fills: [] };

      const { data: fills } = await supabase
        .from('paper_fills')
        .select('order_id, price, qty, side, timestamp')
        .in('order_id', orders.map(o => o.id))
        .order('timestamp', { ascending: true }); // Fix E: Order fills

      return { orders: orders || [], fills: fills || [] };
    },
    enabled: ids.length > 0 && !!account?.id && !!systemState?.current_generation_id,
  });

  // Compute stats with timeframe filtering
  const agentStats = useMemo(() => {
    if (!fillsData) return new Map<string, { wins: number; losses: number; pnlSeries: number[]; totalPnl: number; trades: number }>();
    const { orders, fills } = fillsData;
    const timeframeStart = getTimeframeFilter();
    
    const stats = new Map<string, { 
      wins: number; 
      losses: number; 
      pnlSeries: number[];
      totalPnl: number;
      trades: number;
    }>();

    // Initialize
    ids.forEach(id => stats.set(id, { wins: 0, losses: 0, pnlSeries: [], totalPnl: 0, trades: 0 }));

    // Filter fills by timeframe
    const filteredFills = timeframeStart 
      ? fills.filter(f => new Date(f.timestamp) >= timeframeStart)
      : fills;

    const filteredOrderIds = new Set(filteredFills.map(f => f.order_id));
    const filteredOrders = orders.filter(o => filteredOrderIds.has(o.id));

    // Fix B: Build order lookup map for O(1) access
    const orderById = new Map<string, typeof orders[0]>(filteredOrders.map(o => [o.id, o]));

    // Build per-agent position tracking with explicit types (Fix A)
    const agentPositions = new Map<string, Map<string, Position>>();
    const agentPnLPoints = new Map<string, number[]>();

    filteredFills.forEach(fill => {
      const order = orderById.get(fill.order_id); // Fix B: O(1) lookup
      if (!order?.agent_id) return;

      const agentId = order.agent_id;
      const symbol = order.symbol;
      const agentStat = stats.get(agentId);
      if (!agentStat) return;

      if (!agentPositions.has(agentId)) {
        agentPositions.set(agentId, new Map());
        agentPnLPoints.set(agentId, []);
      }

      const positions = agentPositions.get(agentId)!;
      const pnlPoints = agentPnLPoints.get(agentId)!;

      if (!positions.has(symbol)) {
        positions.set(symbol, { qty: 0, costBasis: 0 });
      }

      const pos = positions.get(symbol)!;
      const prevPnl = pnlPoints.length > 0 ? pnlPoints[pnlPoints.length - 1] : 0;

      if (fill.side === 'buy') {
        pos.qty += fill.qty;
        pos.costBasis += fill.price * fill.qty;
        pnlPoints.push(prevPnl);
      } else {
        const avgEntry = pos.qty > 0 ? pos.costBasis / pos.qty : 0;
        const soldQty = Math.min(fill.qty, pos.qty); // Fix D: Calculate soldQty first
        const realizedPnL = (fill.price - avgEntry) * soldQty; // Fix D: Use soldQty for PnL
        
        pos.qty -= soldQty;
        pos.costBasis = Math.max(0, pos.costBasis - avgEntry * soldQty);
        
        const newPnl = prevPnl + realizedPnL;
        pnlPoints.push(newPnl);
        agentStat.totalPnl = newPnl;

        // Fix C: Only count as trade when we actually close a position
        if (soldQty > 0) {
          agentStat.trades += 1;
          if (realizedPnL > 0) agentStat.wins++;
          else if (realizedPnL < 0) agentStat.losses++;
        }
      }
    });

    // Set final PnL series
    agentPnLPoints.forEach((points, agentId) => {
      const stat = stats.get(agentId);
      if (stat) stat.pnlSeries = points;
    });

    return stats;
  }, [fillsData, timeframe, ids]);

  const getWinRate = (agentId: string) => {
    const stat = agentStats.get(agentId);
    if (!stat) return null;
    const total = stat.wins + stat.losses;
    return total > 0 ? (stat.wins / total) * 100 : null;
  };

  const getStrategyBadge = (template: string) => {
    const colors: Record<string, string> = {
      trend_pullback: 'bg-strategy-trend text-white',
      mean_reversion: 'bg-strategy-mean text-white',
      breakout: 'bg-strategy-breakout text-white',
    };
    const labels: Record<string, string> = {
      trend_pullback: 'Trend',
      mean_reversion: 'MeanRev',
      breakout: 'Breakout',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${colors[template] || 'bg-muted'}`}>
        {labels[template] || template}
      </span>
    );
  };

  if (ids.length === 0) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No agents selected for comparison</p>
          <Button onClick={() => navigate('/agents')}>Back to Agents</Button>
        </Card>
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
            <Users className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">Agent Comparison</h1>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-6">
        {/* Timeframe Control */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Timeframe:</span>
          {(['all', '30d', '7d'] as Timeframe[]).map(tf => (
            <Button
              key={tf}
              variant={timeframe === tf ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeframe(tf)}
            >
              {tf === 'all' ? 'All' : tf.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent: any) => {
            const perf = performance.get(agent.id);
            const stat = agentStats.get(agent.id);
            const winRate = getWinRate(agent.id);

            return (
              <Card key={agent.id} variant="glow" className="overflow-hidden">
                <CardHeader className="pb-2 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-mono text-sm">{agent.id.slice(0, 8)}</CardTitle>
                    <div className="flex items-center gap-1">
                      {agent.is_elite && <span className="text-yellow-500 text-sm">★</span>}
                      {getStrategyBadge(agent.strategy_template)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {/* PnL Sparkline */}
                  <div className="h-16 w-full flex items-center justify-center">
                    {stat?.pnlSeries && stat.pnlSeries.length >= 2 ? (
                      <Sparkline 
                        data={stat.pnlSeries} 
                        width={180} 
                        height={48}
                        period={timeframe === 'all' ? 'All Time' : `Last ${timeframe}`}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">No data</span>
                    )}
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/30 rounded p-2">
                      <div className="text-muted-foreground">Closed Trades</div>
                      <div className="font-mono font-bold">{stat?.trades ?? perf?.total_trades ?? 0}</div>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <div className="text-muted-foreground">Win Rate</div>
                      <div className={`font-mono font-bold ${winRate && winRate >= 50 ? 'text-success' : ''}`}>
                        {winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <div className="text-muted-foreground">Net P&L</div>
                      <div className={`font-mono font-bold ${(stat?.totalPnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {stat?.totalPnl !== undefined 
                          ? `${stat.totalPnl >= 0 ? '+' : ''}$${stat.totalPnl.toFixed(2)}`
                          : perf?.net_pnl !== undefined
                            ? `${perf.net_pnl >= 0 ? '+' : ''}$${perf.net_pnl.toFixed(2)}`
                            : '—'}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <div className="text-muted-foreground">Sharpe</div>
                      <div className={`font-mono font-bold ${perf?.sharpe_ratio >= 1 ? 'text-success' : perf?.sharpe_ratio < 0 ? 'text-destructive' : ''}`}>
                        {perf?.sharpe_ratio != null ? perf.sharpe_ratio.toFixed(2) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Drawdown */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Max Drawdown</span>
                    <span className="font-mono text-destructive">
                      {perf?.max_drawdown != null ? `${(perf.max_drawdown * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Back to leaderboard */}
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => navigate('/agents')}>
            ← Back to Leaderboard
          </Button>
        </div>
      </main>
    </div>
  );
}
