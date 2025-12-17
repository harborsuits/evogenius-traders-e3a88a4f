import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Activity, Filter, TrendingUp, TrendingDown, Pause, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SystemStatus, Generation } from '@/types/evotrader';
import { format } from 'date-fns';

interface DecisionEvent {
  id: string;
  triggered_at: string;
  metadata: {
    decision?: string;
    symbol?: string;
    agent_id?: string;
    confidence?: number;
    reason?: string;
    block_reason?: string;
    top_hold_reasons?: string[];
    strategy?: string;
    generation_id?: string;
  };
}

export default function DecisionLogPage() {
  const navigate = useNavigate();
  const { data: systemState } = useSystemState();
  const currentGeneration = systemState?.generations as Generation | null;
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  
  // Filters
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  
  // Fetch decision events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['decision-log-full', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return [];
      
      const { data } = await supabase
        .from('control_events')
        .select('id, triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(200);
      
      return (data || []) as DecisionEvent[];
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 30000,
  });
  
  // Fetch agents for strategy mapping
  const { data: agents = [] } = useQuery({
    queryKey: ['agents-strategies'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agents')
        .select('id, strategy_template');
      return data || [];
    },
  });
  
  const agentStrategyMap = useMemo(() => {
    return new Map(agents.map(a => [a.id, a.strategy_template]));
  }, [agents]);
  
  // Extract unique symbols and strategies from events
  const { symbols, strategies } = useMemo(() => {
    const symbolSet = new Set<string>();
    const strategySet = new Set<string>();
    
    for (const e of events) {
      if (e.metadata?.symbol) symbolSet.add(e.metadata.symbol);
      const agentId = e.metadata?.agent_id;
      if (agentId && agentStrategyMap.has(agentId)) {
        strategySet.add(agentStrategyMap.get(agentId)!);
      }
    }
    
    return {
      symbols: Array.from(symbolSet).sort(),
      strategies: Array.from(strategySet).sort(),
    };
  }, [events, agentStrategyMap]);
  
  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const decision = e.metadata?.decision?.toLowerCase() || 'hold';
      
      if (decisionFilter !== 'all' && decision !== decisionFilter) return false;
      if (symbolFilter !== 'all' && e.metadata?.symbol !== symbolFilter) return false;
      if (strategyFilter !== 'all') {
        const agentStrategy = agentStrategyMap.get(e.metadata?.agent_id || '');
        if (agentStrategy !== strategyFilter) return false;
      }
      
      return true;
    });
  }, [events, decisionFilter, symbolFilter, strategyFilter, agentStrategyMap]);
  
  // Aggregate hold reasons
  const holdReasonAgg = useMemo(() => {
    const counts: Record<string, number> = {};
    
    for (const e of filteredEvents) {
      const decision = e.metadata?.decision?.toLowerCase();
      if (decision === 'hold' && e.metadata?.top_hold_reasons) {
        for (const r of e.metadata.top_hold_reasons) {
          const match = typeof r === 'string' ? r.match(/^([^:]+)/) : null;
          if (match) {
            counts[match[1]] = (counts[match[1]] || 0) + 1;
          }
        }
      }
    }
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filteredEvents]);
  
  // Decision counts for current filter
  const decisionCounts = useMemo(() => {
    const counts = { buy: 0, sell: 0, hold: 0, blocked: 0 };
    for (const e of filteredEvents) {
      const d = e.metadata?.decision?.toLowerCase() || 'hold';
      if (d === 'buy') counts.buy++;
      else if (d === 'sell') counts.sell++;
      else if (d === 'hold') counts.hold++;
      else if (d === 'blocked') counts.blocked++;
    }
    return counts;
  }, [filteredEvents]);
  
  const getDecisionIcon = (decision: string) => {
    switch (decision?.toLowerCase()) {
      case 'buy': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'sell': return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'hold': return <Pause className="h-4 w-4 text-muted-foreground" />;
      case 'blocked': return <Ban className="h-4 w-4 text-amber-500" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };
  
  const getDecisionBadge = (decision: string) => {
    switch (decision?.toLowerCase()) {
      case 'buy': return <Badge className="bg-success/20 text-success border-success/30">BUY</Badge>;
      case 'sell': return <Badge className="bg-destructive/20 text-destructive border-destructive/30">SELL</Badge>;
      case 'hold': return <Badge variant="outline" className="text-muted-foreground">HOLD</Badge>;
      case 'blocked': return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">BLOCKED</Badge>;
      default: return <Badge variant="outline">{decision}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Header status={status} generationNumber={currentGeneration?.generation_number} />
      <main className="container px-4 md:px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono">Decision Log</h1>
            <p className="text-sm text-muted-foreground">
              Last 200 trade decisions for current generation
            </p>
          </div>
          <Badge variant="glow" className="text-xs">LIVE</Badge>
        </div>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-success/5 border-success/20">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-success">{decisionCounts.buy}</div>
              <div className="text-xs text-muted-foreground mt-1">BUY</div>
            </CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-destructive">{decisionCounts.sell}</div>
              <div className="text-xs text-muted-foreground mt-1">SELL</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/20">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-muted-foreground">{decisionCounts.hold}</div>
              <div className="text-xs text-muted-foreground mt-1">HOLD</div>
            </CardContent>
          </Card>
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-amber-500">{decisionCounts.blocked}</div>
              <div className="text-xs text-muted-foreground mt-1">BLOCKED</div>
            </CardContent>
          </Card>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main table */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Decisions
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={decisionFilter} onValueChange={setDecisionFilter}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue placeholder="Decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="buy">BUY</SelectItem>
                        <SelectItem value="sell">SELL</SelectItem>
                        <SelectItem value="hold">HOLD</SelectItem>
                        <SelectItem value="blocked">BLOCKED</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue placeholder="Symbol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Symbols</SelectItem>
                        {symbols.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="Strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Strategies</SelectItem>
                        {strategies.map(s => (
                          <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {isLoading ? (
                    <div className="p-6 text-center text-muted-foreground animate-pulse">
                      Loading decisions...
                    </div>
                  ) : filteredEvents.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      No decisions found
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/30 sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-medium">Time</th>
                          <th className="text-left p-3 font-medium">Agent</th>
                          <th className="text-left p-3 font-medium">Symbol</th>
                          <th className="text-left p-3 font-medium">Decision</th>
                          <th className="text-left p-3 font-medium">Confidence</th>
                          <th className="text-left p-3 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEvents.map((e) => {
                          const decision = e.metadata?.decision || 'hold';
                          const agentStrategy = agentStrategyMap.get(e.metadata?.agent_id || '');
                          
                          return (
                            <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="p-3 font-mono text-muted-foreground">
                                {format(new Date(e.triggered_at), 'HH:mm:ss')}
                              </td>
                              <td className="p-3">
                                <div className="flex flex-col">
                                  <span className="font-mono">{e.metadata?.agent_id?.slice(0, 8) || '—'}</span>
                                  {agentStrategy && (
                                    <span className="text-[10px] text-muted-foreground">{agentStrategy.replace('_', ' ')}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-mono">{e.metadata?.symbol || '—'}</td>
                              <td className="p-3">{getDecisionBadge(decision)}</td>
                              <td className="p-3">
                                {e.metadata?.confidence !== undefined ? (
                                  <span className={`font-mono ${e.metadata.confidence > 0.7 ? 'text-success' : e.metadata.confidence > 0.4 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                    {(e.metadata.confidence * 100).toFixed(0)}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="p-3 max-w-[200px] truncate text-muted-foreground">
                                {decision.toLowerCase() === 'hold' && e.metadata?.top_hold_reasons
                                  ? e.metadata.top_hold_reasons.slice(0, 2).join(', ')
                                  : e.metadata?.reason || e.metadata?.block_reason || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          
          {/* Why HOLD panel */}
          <div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Pause className="h-4 w-4" />
                  Why HOLD?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {holdReasonAgg.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No hold reasons in selection</div>
                ) : (
                  holdReasonAgg.map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{reason.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary/50 rounded-full"
                            style={{ width: `${Math.min(100, (count / (holdReasonAgg[0]?.[1] || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
