import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { usePaperAccount } from '@/hooks/usePaperTrading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkline } from '@/components/ui/sparkline';
import { ArrowLeft, Trophy, Filter, ChevronUp, ChevronDown, Users, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = 'winRate' | 'sharpe' | null;

export default function AgentsPage() {
  const navigate = useNavigate();
  const { data: systemState } = useSystemState();
  const { data: account } = usePaperAccount();
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const [minTradesFilter, setMinTradesFilter] = useState<string>('');
  const [minWinRateFilter, setMinWinRateFilter] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else if (next.size < 4) {
        next.add(agentId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedAgents(new Set());

  const goToCompare = () => {
    if (selectedAgents.size >= 1) {
      navigate(`/agents/compare?ids=${Array.from(selectedAgents).join(',')}`);
    }
  };
  
  // Fetch agents with performance
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['all-agents', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return [];
      
      const { data: cohort } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', systemState.current_generation_id);
      
      if (!cohort?.length) return [];
      
      const agentIds = cohort.map(c => c.agent_id);
      
      const { data: agentsData } = await supabase
        .from('agents')
        .select('*')
        .in('id', agentIds);
      
      const { data: perfData } = await supabase
        .from('performance')
        .select('*')
        .eq('generation_id', systemState.current_generation_id)
        .in('agent_id', agentIds);
      
      const perfMap = new Map(perfData?.map(p => [p.agent_id, p]) || []);
      
      return (agentsData || [])
        .map(agent => ({
          ...agent,
          performance: perfMap.get(agent.id) || null,
        }))
        .sort((a, b) => {
          const aFit = a.performance?.fitness_score ?? -999;
          const bFit = b.performance?.fitness_score ?? -999;
          return bFit - aFit;
        });
    },
    enabled: !!systemState?.current_generation_id,
  });

  // Fetch trade outcomes per agent to compute win rate
  const { data: agentTradeStats = new Map() } = useQuery({
    queryKey: ['agent-trade-stats', account?.id, systemState?.current_generation_id],
    queryFn: async () => {
      if (!account?.id || !systemState?.current_generation_id) return new Map();
      
      // Get all filled orders for current generation
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, side, symbol, filled_price, filled_qty')
        .eq('account_id', account.id)
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled');
      
      if (!orders?.length) return new Map();

      // Get fills for PnL calculation
      const { data: fills } = await supabase
        .from('paper_fills')
        .select('order_id, price, qty, side, fee')
        .in('order_id', orders.map(o => o.id));

      // Group by agent and compute wins/losses based on realized PnL
      // For simplicity: track per-agent position changes and infer PnL per closed position
      const agentStats = new Map<string, { wins: number; losses: number }>();
      
      // Initialize stats for all agents
      orders.forEach(order => {
        if (order.agent_id && !agentStats.has(order.agent_id)) {
          agentStats.set(order.agent_id, { wins: 0, losses: 0 });
        }
      });

      // Group fills by agent and symbol to compute realized PnL
      const agentSymbolFills = new Map<string, { buys: number[]; sells: number[]; buyQtys: number[]; sellQtys: number[] }>();
      
      fills?.forEach(fill => {
        const order = orders.find(o => o.id === fill.order_id);
        if (!order?.agent_id) return;
        
        const key = `${order.agent_id}:${order.symbol}`;
        if (!agentSymbolFills.has(key)) {
          agentSymbolFills.set(key, { buys: [], sells: [], buyQtys: [], sellQtys: [] });
        }
        
        const data = agentSymbolFills.get(key)!;
        if (fill.side === 'buy') {
          data.buys.push(fill.price);
          data.buyQtys.push(fill.qty);
        } else {
          data.sells.push(fill.price);
          data.sellQtys.push(fill.qty);
        }
      });

      // For each agent-symbol pair, estimate win/loss from avg buy vs avg sell
      agentSymbolFills.forEach((data, key) => {
        const agentId = key.split(':')[0];
        const stats = agentStats.get(agentId);
        if (!stats) return;

        const totalBuyQty = data.buyQtys.reduce((a, b) => a + b, 0);
        const totalSellQty = data.sellQtys.reduce((a, b) => a + b, 0);
        
        if (totalBuyQty > 0 && totalSellQty > 0) {
          // Has both buys and sells - compute rough PnL
          const avgBuy = data.buys.reduce((sum, p, i) => sum + p * data.buyQtys[i], 0) / totalBuyQty;
          const avgSell = data.sells.reduce((sum, p, i) => sum + p * data.sellQtys[i], 0) / totalSellQty;
          const closedQty = Math.min(totalBuyQty, totalSellQty);
          const pnl = (avgSell - avgBuy) * closedQty;
          
          if (pnl > 0) {
            stats.wins++;
          } else if (pnl < 0) {
            stats.losses++;
          }
          // breakeven (pnl === 0) is ignored
        }
      });

      return agentStats;
    },
    enabled: !!account?.id && !!systemState?.current_generation_id,
  });

  // Fetch PnL time series per agent for sparklines
  const { data: agentPnLSeries = new Map() } = useQuery({
    queryKey: ['agent-pnl-series', account?.id, systemState?.current_generation_id],
    queryFn: async () => {
      if (!account?.id || !systemState?.current_generation_id) return new Map();
      
      // Get all filled orders with timestamps for current generation
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, symbol, side, created_at')
        .eq('account_id', account.id)
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled')
        .order('created_at', { ascending: true });
      
      if (!orders?.length) return new Map();

      // Get fills
      const { data: fills } = await supabase
        .from('paper_fills')
        .select('order_id, price, qty, side, timestamp')
        .in('order_id', orders.map(o => o.id))
        .order('timestamp', { ascending: true });

      if (!fills?.length) return new Map();

      // Build cumulative PnL series per agent
      // Track position and compute realized PnL on sells
      const agentPositions = new Map<string, Map<string, { qty: number; costBasis: number }>>();
      const agentPnLPoints = new Map<string, { timestamp: string; pnl: number }[]>();

      fills.forEach(fill => {
        const order = orders.find(o => o.id === fill.order_id);
        if (!order?.agent_id) return;

        const agentId = order.agent_id;
        const symbol = order.symbol;

        // Initialize agent tracking
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
        const prevCumulativePnL = pnlPoints.length > 0 ? pnlPoints[pnlPoints.length - 1].pnl : 0;

        if (fill.side === 'buy') {
          // Add to position
          const newQty = pos.qty + fill.qty;
          const newCost = pos.costBasis + (fill.price * fill.qty);
          pos.qty = newQty;
          pos.costBasis = newCost;
          // No realized PnL on buy, but record point
          pnlPoints.push({ timestamp: fill.timestamp, pnl: prevCumulativePnL });
        } else {
          // Sell - realize PnL
          const avgEntry = pos.qty > 0 ? pos.costBasis / pos.qty : 0;
          const realizedPnL = (fill.price - avgEntry) * fill.qty;
          
          // Update position
          const soldQty = Math.min(fill.qty, pos.qty);
          const costReduction = avgEntry * soldQty;
          pos.qty -= soldQty;
          pos.costBasis = Math.max(0, pos.costBasis - costReduction);
          
          // Record cumulative PnL
          pnlPoints.push({ timestamp: fill.timestamp, pnl: prevCumulativePnL + realizedPnL });
        }
      });

      // Convert to simple number arrays for sparklines
      const result = new Map<string, number[]>();
      agentPnLPoints.forEach((points, agentId) => {
        if (points.length >= 2) {
          result.set(agentId, points.map(p => p.pnl));
        }
      });

      return result;
    },
    enabled: !!account?.id && !!systemState?.current_generation_id,
  });

  // Compute win rate for an agent
  const getWinRate = (agentId: string): number | null => {
    const stats = agentTradeStats.get(agentId);
    if (!stats) return null;
    const total = stats.wins + stats.losses;
    if (total === 0) return null;
    return (stats.wins / total) * 100;
  };

  // Filter and sort agents
  const minTrades = parseInt(minTradesFilter) || 0;
  const minWinRate = parseFloat(minWinRateFilter) || 0;
  
  const filteredAgents = useMemo(() => {
    let result = agents.filter((agent: any) => {
      if (strategyFilter !== 'all' && agent.strategy_template !== strategyFilter) return false;
      if (minTrades > 0 && (agent.performance?.total_trades ?? 0) < minTrades) return false;
      if (minWinRate > 0) {
        const wr = getWinRate(agent.id);
        if (wr === null || wr < minWinRate) return false;
      }
      return true;
    });

    // Apply column sort if active
    if (sortColumn && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal: number, bVal: number;
        
        if (sortColumn === 'winRate') {
          aVal = getWinRate(a.id) ?? -1;
          bVal = getWinRate(b.id) ?? -1;
        } else if (sortColumn === 'sharpe') {
          aVal = a.performance?.sharpe_ratio ?? -999;
          bVal = b.performance?.sharpe_ratio ?? -999;
        } else {
          return 0;
        }
        
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [agents, strategyFilter, minTrades, minWinRate, sortColumn, sortDirection, agentTradeStats]);

  const toggleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection('desc');
    } else if (sortDirection === 'desc') {
      setSortDirection('asc');
    } else {
      setSortColumn(null);
      setSortDirection(null);
    }
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
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[template] || 'bg-muted'}`}>
        {labels[template] || template}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading agents...</div>
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
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h1 className="font-mono text-lg text-primary">Agent Leaderboard</h1>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Total Agents</div>
              <div className="font-mono text-2xl font-bold">{agents.length}</div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Elite</div>
              <div className="font-mono text-2xl text-yellow-500">
                {agents.filter((a: any) => a.is_elite).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">With Trades</div>
              <div className="font-mono text-2xl">
                {agents.filter((a: any) => (a.performance?.total_trades ?? 0) > 0).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Avg Fitness</div>
              <div className="font-mono text-2xl">
                {agents.length > 0 
                  ? (agents.reduce((sum: number, a: any) => sum + (a.performance?.fitness_score ?? 0), 0) / agents.length * 100).toFixed(1)
                  : 0}%
              </div>
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
            <div className="flex gap-4 flex-wrap items-center">
              <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="trend_pullback">Trend</SelectItem>
                  <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                  <SelectItem value="breakout">Breakout</SelectItem>
                </SelectContent>
              </Select>
              <Input 
                placeholder="Min trades..."
                type="number"
                value={minTradesFilter}
                onChange={e => setMinTradesFilter(e.target.value)}
                className="w-28"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min Win%</span>
                <Input 
                  placeholder="0-100"
                  type="number"
                  min={0}
                  max={100}
                  value={minWinRateFilter}
                  onChange={e => setMinWinRateFilter(e.target.value)}
                  className="w-20"
                />
              </div>
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {filteredAgents.length} / {agents.length} agents
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Selection Bar */}
        {selectedAgents.size > 0 && (
          <div className="sticky top-16 z-40 bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center gap-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-mono text-sm">{selectedAgents.size} selected</span>
            </div>
            <Button size="sm" onClick={goToCompare} disabled={selectedAgents.size < 1}>
              Compare ({selectedAgents.size})
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Agent Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="text-center py-3 px-2 w-10"></th>
                    <th className="text-left py-3 px-2">Rank</th>
                    <th className="text-left py-3 px-2">Agent ID</th>
                    <th className="text-left py-3 px-2">Strategy</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Trades</th>
                    <th 
                      className="text-right py-3 px-2 cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('winRate')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Win Rate
                        {sortColumn === 'winRate' && sortDirection === 'desc' && <ChevronDown className="h-3 w-3" />}
                        {sortColumn === 'winRate' && sortDirection === 'asc' && <ChevronUp className="h-3 w-3" />}
                      </span>
                    </th>
                    <th 
                      className="text-right py-3 px-2 cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('sharpe')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Sharpe
                        {sortColumn === 'sharpe' && sortDirection === 'desc' && <ChevronDown className="h-3 w-3" />}
                        {sortColumn === 'sharpe' && sortDirection === 'asc' && <ChevronUp className="h-3 w-3" />}
                      </span>
                    </th>
                    <th className="text-center py-3 px-2">PnL Trend</th>
                    <th className="text-right py-3 px-2">Net P&L</th>
                    <th className="text-right py-3 px-2">Fitness</th>
                    <th className="text-right py-3 px-2">Drawdown</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent: any, index) => {
                    const winRate = getWinRate(agent.id);
                    return (
                      <tr key={agent.id} className={`border-b border-border/50 hover:bg-muted/30 ${selectedAgents.has(agent.id) ? 'bg-primary/10' : ''}`}>
                        <td className="py-2 px-2 text-center">
                          <Checkbox
                            checked={selectedAgents.has(agent.id)}
                            onCheckedChange={() => toggleAgentSelection(agent.id)}
                            disabled={!selectedAgents.has(agent.id) && selectedAgents.size >= 4}
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-muted-foreground">
                          #{index + 1}
                        </td>
                        <td className="py-2 px-2">
                          <Link 
                            to={`/agents/${agent.id}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {agent.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="py-2 px-2">
                          {getStrategyBadge(agent.strategy_template)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {agent.is_elite && <span className="text-yellow-500">★</span>}
                            <Badge variant="outline" className="text-[10px]">
                              {agent.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {agent.performance?.total_trades ?? 0}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {winRate !== null ? (
                            <span className={winRate >= 50 ? 'text-success' : 'text-muted-foreground'}>
                              {winRate.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {agent.performance?.sharpe_ratio != null ? (
                            <span className={agent.performance.sharpe_ratio >= 1 ? 'text-success' : agent.performance.sharpe_ratio >= 0 ? 'text-muted-foreground' : 'text-destructive'}>
                              {agent.performance.sharpe_ratio.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Sparkline 
                            data={agentPnLSeries.get(agent.id) || []} 
                            width={100} 
                            height={24}
                            period="Current Gen"
                          />
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${
                          (agent.performance?.net_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'
                        }`}>
                          {(agent.performance?.net_pnl ?? 0) >= 0 ? '+' : ''}
                          ${(agent.performance?.net_pnl ?? 0).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {agent.performance?.fitness_score != null ? (
                            <Badge 
                              variant={
                                agent.performance.fitness_score > 0.3 ? 'default' : 
                                agent.performance.fitness_score > 0 ? 'secondary' : 
                                'destructive'
                              }
                            >
                              {(agent.performance.fitness_score * 100).toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-destructive">
                          {agent.performance?.max_drawdown 
                            ? `${(agent.performance.max_drawdown * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="py-2 px-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            asChild
                          >
                            <Link to={`/agents/${agent.id}`}>
                              View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
