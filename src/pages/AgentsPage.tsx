import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, Activity, Dna } from 'lucide-react';

export default function AgentsPage() {
  const navigate = useNavigate();
  const { data: systemState } = useSystemState();
  
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
                {agents.filter(a => a.is_elite).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">With Trades</div>
              <div className="font-mono text-2xl">
                {agents.filter(a => (a.performance?.total_trades ?? 0) > 0).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Avg Fitness</div>
              <div className="font-mono text-2xl">
                {agents.length > 0 
                  ? (agents.reduce((sum, a) => sum + (a.performance?.fitness_score ?? 0), 0) / agents.length * 100).toFixed(1)
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>
        
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
                    <th className="text-left py-3 px-2">Rank</th>
                    <th className="text-left py-3 px-2">Agent ID</th>
                    <th className="text-left py-3 px-2">Strategy</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Trades</th>
                    <th className="text-right py-3 px-2">Net P&L</th>
                    <th className="text-right py-3 px-2">Fitness</th>
                    <th className="text-right py-3 px-2">Drawdown</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent: any, index) => (
                    <tr key={agent.id} className="border-b border-border/50 hover:bg-muted/30">
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
