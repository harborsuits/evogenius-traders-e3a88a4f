import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, 
  Upload, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AgentSnapshot {
  agent_id: string;
  strategy_template: string;
  genes: Record<string, number>;
  fitness_score: number;
  net_pnl: number;
  total_trades: number;
  max_drawdown: number;
  sharpe_ratio: number;
  is_elite: boolean;
  role: string;
}

interface PerformanceSummary {
  agent_count: number;
  avg_fitness: number;
  total_pnl: number;
  avg_trades: number;
  max_drawdown: number;
  strategy_breakdown: Record<string, number>;
}

interface BrainSnapshot {
  id: string;
  version_number: number;
  promoted_at: string;
  source_generation_id: string;
  agent_snapshots: AgentSnapshot[];
  performance_summary: PerformanceSummary;
  is_active: boolean;
  notes: string | null;
}

export function LiveBrainPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPromoting, setIsPromoting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState(false);

  // Fetch active snapshot
  const { data: activeSnapshot, isLoading } = useQuery({
    queryKey: ['live-brain-active'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'get' },
      });
      if (error) throw error;
      return data.snapshot as BrainSnapshot | null;
    },
    refetchInterval: 30000,
  });

  // Fetch snapshot history
  const { data: historyData } = useQuery({
    queryKey: ['live-brain-history'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return data.snapshots as Partial<BrainSnapshot>[];
    },
    enabled: showHistory,
  });

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'promote', minTrades: 3, topN: 10 },
      });
      
      if (error) throw error;
      
      if (!data.ok) {
        toast({
          title: 'Cannot Promote',
          description: data.error || 'Not enough qualified agents',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Brain Promoted',
        description: `Created v${data.snapshot.version_number} with ${data.summary.agent_count} agents`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['live-brain-active'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-history'] });
    } catch (err) {
      toast({
        title: 'Promotion Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsPromoting(false);
    }
  };

  const handleRollback = async (snapshotId: string, version: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'rollback', snapshotId },
      });
      
      if (error) throw error;
      
      toast({
        title: 'Rollback Complete',
        description: `Activated brain v${version}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['live-brain-active'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-history'] });
    } catch (err) {
      toast({
        title: 'Rollback Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const getStrategyColor = (template: string) => {
    switch (template) {
      case 'trend_pullback': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'mean_reversion': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'breakout': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Live Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Live Brain
          </CardTitle>
          {activeSnapshot ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              v{activeSnapshot.version_number}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              No Snapshot
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active snapshot info */}
        {activeSnapshot ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {formatDistanceToNow(new Date(activeSnapshot.promoted_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{activeSnapshot.performance_summary.agent_count} agents</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={activeSnapshot.performance_summary.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  ${activeSnapshot.performance_summary.total_pnl.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                <span>{(activeSnapshot.performance_summary.avg_fitness * 100).toFixed(1)}% avg</span>
              </div>
            </div>

            {/* Strategy breakdown */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(activeSnapshot.performance_summary.strategy_breakdown).map(([strategy, count]) => (
                <Badge key={strategy} variant="outline" className={getStrategyColor(strategy)}>
                  {strategy.replace('_', ' ')} ({count})
                </Badge>
              ))}
            </div>

            {/* Expandable agent list */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs"
                onClick={() => setExpandedAgents(!expandedAgents)}
              >
                <span>Frozen Agents</span>
                {expandedAgents ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              
              {expandedAgents && (
                <ScrollArea className="h-32 mt-2">
                  <div className="space-y-1.5 pr-3">
                    {activeSnapshot.agent_snapshots.map((agent, i) => (
                      <div key={agent.agent_id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-4">{i + 1}.</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 ${getStrategyColor(agent.strategy_template)}`}>
                            {agent.strategy_template.charAt(0).toUpperCase()}
                          </Badge>
                          <code className="text-[10px] text-muted-foreground">
                            {agent.agent_id.slice(0, 8)}
                          </code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={agent.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            ${agent.net_pnl.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">
                            {(agent.fitness_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No live brain snapshot active</p>
            <p className="text-xs mt-1">Promote elites to create a frozen brain for live trading</p>
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={handlePromote}
            disabled={isPromoting}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {isPromoting ? 'Promoting...' : 'Promote Elites'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* History / Rollback */}
        {showHistory && historyData && historyData.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Version History</p>
            <ScrollArea className="h-32">
              <div className="space-y-1.5 pr-3">
                {historyData.map((snapshot) => (
                  <div 
                    key={snapshot.id} 
                    className={`flex items-center justify-between text-xs p-2 rounded border ${
                      snapshot.is_active 
                        ? 'bg-primary/10 border-primary/30' 
                        : 'bg-muted/20 border-transparent hover:border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono">v{snapshot.version_number}</span>
                      {snapshot.is_active && (
                        <Badge variant="outline" className="text-[10px] px-1 bg-primary/20">
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(snapshot.promoted_at!), { addSuffix: true })}
                      </span>
                      {!snapshot.is_active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => handleRollback(snapshot.id!, snapshot.version_number!)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Notes */}
        {activeSnapshot?.notes && (
          <p className="text-xs text-muted-foreground italic">
            "{activeSnapshot.notes}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}
