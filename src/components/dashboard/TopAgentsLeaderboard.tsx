import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';

interface AgentWithPerformance {
  agent_id: string;
  strategy_template: string;
  is_elite: boolean;
  fitness_score: number | null;
  net_pnl: number | null;
  total_trades: number | null;
  max_drawdown: number | null;
}

interface TopAgentsLeaderboardProps {
  generationId: string | null;
}

export function TopAgentsLeaderboard({ generationId }: TopAgentsLeaderboardProps) {
  const { data: topAgents, isLoading } = useQuery({
    queryKey: ['top-agents', generationId],
    queryFn: async () => {
      if (!generationId) return [];

      // Fetch agents in the current generation with their performance
      const { data: cohortAgents, error: cohortError } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', generationId);

      if (cohortError) throw cohortError;
      if (!cohortAgents || cohortAgents.length === 0) return [];

      const agentIds = cohortAgents.map(ca => ca.agent_id);

      // Fetch agent details
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, strategy_template, is_elite')
        .in('id', agentIds);

      if (agentsError) throw agentsError;

      // Fetch performance for these agents in this generation
      const { data: performances, error: perfError } = await supabase
        .from('performance')
        .select('agent_id, fitness_score, net_pnl, total_trades, max_drawdown')
        .eq('generation_id', generationId)
        .in('agent_id', agentIds);

      if (perfError) throw perfError;

      // Create a map of performance by agent_id
      const perfMap = new Map(performances?.map(p => [p.agent_id, p]) || []);

      // Combine agent data with performance
      const combined: AgentWithPerformance[] = (agents || []).map(agent => {
        const perf = perfMap.get(agent.id);
        return {
          agent_id: agent.id,
          strategy_template: agent.strategy_template,
          is_elite: agent.is_elite,
          fitness_score: perf?.fitness_score ?? null,
          net_pnl: perf?.net_pnl ?? null,
          total_trades: perf?.total_trades ?? null,
          max_drawdown: perf?.max_drawdown ?? null,
        };
      });

      // Sort by fitness (nulls last), then by trades count
      combined.sort((a, b) => {
        if (a.fitness_score === null && b.fitness_score === null) {
          return (b.total_trades ?? 0) - (a.total_trades ?? 0);
        }
        if (a.fitness_score === null) return 1;
        if (b.fitness_score === null) return -1;
        return b.fitness_score - a.fitness_score;
      });

      // Return top 10
      return combined.slice(0, 10);
    },
    enabled: !!generationId,
    refetchInterval: 60000,
  });

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Top Agents ({topAgents?.length ?? 0})
        </h3>
        <Badge variant="outline" className="text-[10px]">LIVE</Badge>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading agents...</div>
      ) : !topAgents || topAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">No agents in cohort yet.</p>
          <p className="text-xs text-muted-foreground/70">Start a generation to populate.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {topAgents.map((agent, index) => (
            <div
              key={agent.agent_id}
              className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-5">
                  #{index + 1}
                </span>
                <span className="text-xs font-mono">
                  {agent.agent_id.substring(0, 8)}
                </span>
                {getStrategyBadge(agent.strategy_template)}
                {agent.is_elite && (
                  <span className="text-[10px] text-yellow-500">★</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* PnL */}
                <div className="flex items-center gap-1 text-xs w-16 justify-end">
                  {agent.net_pnl !== null ? (
                    <>
                      {agent.net_pnl >= 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className={agent.net_pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                        ${agent.net_pnl.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Trades */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground w-8">
                  <Activity className="h-3 w-3" />
                  {agent.total_trades ?? 0}
                </div>

                {/* Fitness */}
                <div className="w-12 text-right">
                  {agent.fitness_score !== null ? (
                    <Badge 
                      variant={agent.fitness_score > 0.3 ? 'default' : agent.fitness_score > 0 ? 'secondary' : 'destructive'}
                      className="text-[10px]"
                    >
                      {(agent.fitness_score * 100).toFixed(0)}%
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">N/A</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border/30 pt-2">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-strategy-trend" />
          <span>Trend</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-strategy-mean" />
          <span>MeanRev</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-strategy-breakout" />
          <span>Breakout</span>
        </div>
      </div>
    </div>
  );
}
