import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Coins, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Scale } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Json = Record<string, unknown>;

interface TopAgentCost {
  agent_id: string;
  score: string;
  pnl: string;
  trades: number;
  total_fees: string;
  cost_drag_pct: string;
  avg_cost_per_trade: string;
  cost_efficiency: string;
  fee_burden_pct: string;
}

interface FitnessEvent {
  id: string;
  triggered_at: string;
  metadata: Json;
}

export function CostEfficiencyAudit({ compact }: { compact?: boolean }) {
  // Fetch last N fitness_calculated events
  const { data: fitnessEvents, isLoading } = useQuery({
    queryKey: ['fitness-cost-audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('id, triggered_at, metadata')
        .eq('action', 'fitness_calculated')
        .order('triggered_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as FitnessEvent[];
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center text-muted-foreground">
          Loading cost audit...
        </CardContent>
      </Card>
    );
  }

  const latestEvent = fitnessEvents?.[0];
  const meta = latestEvent?.metadata as Json | undefined;
  
  // Extract aggregate metrics
  const totalFeesAllAgents = meta?.total_fees_all_agents as string | undefined;
  const avgCostDragPct = meta?.avg_cost_drag_pct as string | undefined;
  const avgCostEfficiency = meta?.avg_cost_efficiency as string | undefined;
  const avgFeeBurdenPct = meta?.avg_fee_burden_pct as string | undefined;
  const topAgents = (meta?.top_agents as TopAgentCost[] | undefined) ?? [];
  const generationNumber = meta?.generation_number as number | undefined;

  // Sort agents by cost_efficiency for best/worst
  const agentsByEfficiency = [...topAgents].sort((a, b) => {
    const aEff = parseFloat(a.cost_efficiency) || 0;
    const bEff = parseFloat(b.cost_efficiency) || 0;
    return bEff - aEff;
  });
  
  const bestAgents = agentsByEfficiency.slice(0, 3);
  const worstAgents = agentsByEfficiency.slice(-3).reverse();

  // Parse numeric values for conditional styling
  const avgEffNum = parseFloat(avgCostEfficiency || '0');
  const avgBurdenNum = parseFloat(avgFeeBurdenPct?.replace('%', '') || '0');

  if (!latestEvent) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Cost Efficiency Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          No fitness calculations yet
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Cost Audit
            <Badge variant="outline" className="ml-auto text-xs">
              Gen {generationNumber}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Total Fees</span>
              <span className="font-mono font-medium">${totalFeesAllAgents || '0'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Avg Efficiency</span>
              <span className={cn(
                "font-mono font-medium",
                avgEffNum > 1 ? "text-success" : avgEffNum < 0 ? "text-destructive" : "text-foreground"
              )}>
                {avgCostEfficiency || '0'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Fee Burden</span>
              <span className={cn(
                "font-mono font-medium",
                avgBurdenNum > 50 ? "text-destructive" : avgBurdenNum > 25 ? "text-warning" : "text-success"
              )}>
                {avgFeeBurdenPct || '0%'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Cost Drag</span>
              <span className="font-mono font-medium">{avgCostDragPct || '0%'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Coins className="w-4 h-4" />
          Cost Efficiency Audit
          <Badge variant="outline" className="ml-auto text-xs">
            Gen {generationNumber}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(latestEvent.triggered_at), { addSuffix: true })}
        </p>
      </CardHeader>
      <CardContent className="p-3 space-y-4">
        {/* Aggregate Metrics */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <Scale className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Total Fees</span>
              <span className="font-mono font-medium">${totalFeesAllAgents || '0'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Avg Cost Efficiency</span>
              <span className={cn(
                "font-mono font-medium",
                avgEffNum > 1 ? "text-success" : avgEffNum < 0 ? "text-destructive" : "text-foreground"
              )}>
                {avgCostEfficiency || '0'} $/fee$
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Avg Fee Burden</span>
              <span className={cn(
                "font-mono font-medium",
                avgBurdenNum > 50 ? "text-destructive" : avgBurdenNum > 25 ? "text-warning" : "text-success"
              )}>
                {avgFeeBurdenPct || '0%'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
            <Coins className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Avg Cost Drag</span>
              <span className="font-mono font-medium">{avgCostDragPct || '0%'}</span>
            </div>
          </div>
        </div>

        {/* Best & Worst Agents */}
        <div className="grid grid-cols-2 gap-3">
          {/* Best */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs text-success font-medium">
              <CheckCircle className="w-3 h-3" />
              Best Efficiency
            </div>
            <ScrollArea className="h-24">
              <div className="space-y-1">
                {bestAgents.map((agent, i) => (
                  <div key={agent.agent_id} className="flex items-center justify-between text-xs p-1 bg-success/10 rounded">
                    <span className="font-mono">{agent.agent_id}</span>
                    <span className="font-mono text-success">{agent.cost_efficiency}</span>
                  </div>
                ))}
                {bestAgents.length === 0 && (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Worst */}
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs text-destructive font-medium">
              <TrendingDown className="w-3 h-3" />
              Worst Efficiency
            </div>
            <ScrollArea className="h-24">
              <div className="space-y-1">
                {worstAgents.map((agent, i) => (
                  <div key={agent.agent_id} className="flex items-center justify-between text-xs p-1 bg-destructive/10 rounded">
                    <span className="font-mono">{agent.agent_id}</span>
                    <span className="font-mono text-destructive">{agent.cost_efficiency}</span>
                  </div>
                ))}
                {worstAgents.length === 0 && (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Full Agent Table */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Top Agents Detail</p>
          <ScrollArea className="h-32">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left p-1">Agent</th>
                  <th className="text-right p-1">PnL</th>
                  <th className="text-right p-1">Trades</th>
                  <th className="text-right p-1">Fees</th>
                  <th className="text-right p-1">Eff</th>
                  <th className="text-right p-1">Burden</th>
                </tr>
              </thead>
              <tbody>
                {topAgents.map((agent) => {
                  const effNum = parseFloat(agent.cost_efficiency) || 0;
                  const burdenNum = parseFloat(agent.fee_burden_pct?.replace('%', '') || '0');
                  return (
                    <tr key={agent.agent_id} className="border-b border-border/50">
                      <td className="p-1 font-mono">{agent.agent_id}</td>
                      <td className={cn(
                        "p-1 text-right font-mono",
                        parseFloat(agent.pnl) >= 0 ? "text-success" : "text-destructive"
                      )}>
                        ${agent.pnl}
                      </td>
                      <td className="p-1 text-right">{agent.trades}</td>
                      <td className="p-1 text-right font-mono">${agent.total_fees}</td>
                      <td className={cn(
                        "p-1 text-right font-mono",
                        effNum > 1 ? "text-success" : effNum < 0 ? "text-destructive" : ""
                      )}>
                        {agent.cost_efficiency}
                      </td>
                      <td className={cn(
                        "p-1 text-right font-mono",
                        burdenNum > 50 ? "text-destructive" : burdenNum > 25 ? "text-warning" : "text-success"
                      )}>
                        {agent.fee_burden_pct}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
