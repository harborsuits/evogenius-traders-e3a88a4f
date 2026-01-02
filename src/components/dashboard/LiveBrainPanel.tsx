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
  ChevronUp,
  Play,
  FileCheck,
  XCircle,
  Shield
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
  gates_passed?: boolean;
  gate_failures?: string[];
}

interface PerformanceSummary {
  agent_count: number;
  qualified_count?: number;
  avg_fitness: number;
  total_pnl: number;
  avg_trades: number;
  max_drawdown: number;
  strategy_breakdown: Record<string, number>;
}

interface GateResults {
  agent_gates: {
    total_evaluated: number;
    passed: number;
    failed: number;
    failures_by_gate: Record<string, number>;
  };
  snapshot_gates: {
    min_qualified_agents: { required: number; actual: number; passed: boolean };
    max_aggregate_drawdown: { threshold: number; actual: number; passed: boolean };
    min_strategy_diversity: { required: number; actual: number; passed: boolean };
  };
  all_passed: boolean;
}

interface BrainSnapshot {
  id: string;
  version_number: number;
  promoted_at: string;
  source_generation_id: string;
  agent_snapshots: AgentSnapshot[];
  performance_summary: PerformanceSummary;
  is_active: boolean;
  status: 'candidate' | 'active' | 'inactive';
  notes: string | null;
  gates_passed?: GateResults;
  gates_validated_at?: string;
}

export function LiveBrainPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState(false);
  const [expandedGates, setExpandedGates] = useState(false);

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

  // Fetch candidates
  const { data: candidatesData } = useQuery({
    queryKey: ['live-brain-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'get-candidates' },
      });
      if (error) throw error;
      return data.candidates as Partial<BrainSnapshot>[];
    },
    enabled: showCandidates,
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

  const handleCreateCandidate = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'create-candidate', topN: 10 },
      });
      
      if (error) throw error;
      
      if (!data.ok) {
        toast({
          title: 'Cannot Create Candidate',
          description: data.error || 'Failed to create candidate',
          variant: 'destructive',
        });
        return;
      }

      const gatesPassed = data.gate_results?.all_passed;
      
      // Build description with failed gates if any
      let description = `Created v${data.snapshot.version_number} - ${data.summary.qualified_count || 0}/${data.summary.agent_count} qualified`;
      if (!gatesPassed && data.gate_results) {
        const failedGates: string[] = [];
        // Check snapshot gates
        const sg = data.gate_results.snapshot_gates;
        if (sg?.min_qualified_agents && !sg.min_qualified_agents.passed) {
          failedGates.push(`agents: ${sg.min_qualified_agents.actual}/${sg.min_qualified_agents.required}`);
        }
        if (sg?.max_aggregate_drawdown && !sg.max_aggregate_drawdown.passed) {
          failedGates.push(`drawdown: ${(sg.max_aggregate_drawdown.actual * 100).toFixed(0)}%>${(sg.max_aggregate_drawdown.threshold * 100).toFixed(0)}%`);
        }
        if (sg?.min_strategy_diversity && !sg.min_strategy_diversity.passed) {
          failedGates.push(`diversity: ${sg.min_strategy_diversity.actual}/${sg.min_strategy_diversity.required}`);
        }
        // Add agent gate summary
        const ag = data.gate_results.agent_gates;
        if (ag?.failures_by_gate) {
          const topFailure = Object.entries(ag.failures_by_gate).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
          if (topFailure) {
            failedGates.push(`${topFailure[0]}: ${topFailure[1]} agents`);
          }
        }
        if (failedGates.length > 0) {
          description += ` | Failed: ${failedGates.join(', ')}`;
        }
      }
      
      toast({
        title: gatesPassed ? 'Candidate Ready' : 'Candidate Created (Gates Failed)',
        description,
        variant: gatesPassed ? 'default' : 'destructive',
      });
      
      queryClient.invalidateQueries({ queryKey: ['live-brain-active'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-history'] });
      setShowCandidates(true);
    } catch (err) {
      toast({
        title: 'Creation Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleActivate = async (snapshotId: string, version: number) => {
    setIsActivating(snapshotId);
    try {
      const { data, error } = await supabase.functions.invoke('promote-brain', {
        body: { action: 'activate', snapshotId },
      });
      
      if (error) throw error;
      
      if (!data.ok) {
        toast({
          title: 'Cannot Activate',
          description: data.error || 'Gates not passed',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Brain Activated',
        description: `v${version} is now the live brain`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['live-brain-active'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['live-brain-history'] });
    } catch (err) {
      toast({
        title: 'Activation Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsActivating(null);
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
      queryClient.invalidateQueries({ queryKey: ['live-brain-candidates'] });
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

  const getStatusBadge = (status: string, gatesPassed?: boolean) => {
    if (status === 'active') {
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          ACTIVE
        </Badge>
      );
    }
    if (status === 'candidate') {
      if (gatesPassed) {
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            <FileCheck className="h-3 w-3 mr-1" />
            READY
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          BLOCKED
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        INACTIVE
      </Badge>
    );
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
              No Brain
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

            {/* Gate Results (if available) */}
            {activeSnapshot.gates_passed && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs"
                  onClick={() => setExpandedGates(!expandedGates)}
                >
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    Gate Validation
                    {activeSnapshot.gates_passed.all_passed ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                  </span>
                  {expandedGates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                
                {expandedGates && (
                  <div className="mt-2 p-2 rounded bg-muted/30 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agents Passed:</span>
                      <span>{activeSnapshot.gates_passed.agent_gates.passed}/{activeSnapshot.gates_passed.agent_gates.total_evaluated}</span>
                    </div>
                    {Object.entries(activeSnapshot.gates_passed.snapshot_gates).map(([gate, result]) => (
                      <div key={gate} className="flex justify-between">
                        <span className="text-muted-foreground">{gate.replace(/_/g, ' ')}:</span>
                        <span className={result.passed ? 'text-emerald-400' : 'text-red-400'}>
                          {typeof result.actual === 'number' && result.actual < 1 
                            ? `${(result.actual * 100).toFixed(1)}%` 
                            : result.actual}
                          {result.passed ? ' ✓' : ' ✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                          {agent.gates_passed === false && (
                            <XCircle className="h-3 w-3 text-red-400" />
                          )}
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
            <p className="text-xs mt-1">Create a candidate and activate when gates pass</p>
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={handleCreateCandidate}
            disabled={isCreating}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {isCreating ? 'Creating...' : 'Create Candidate'}
          </Button>
          <Button
            size="sm"
            variant={showCandidates ? 'default' : 'outline'}
            onClick={() => { setShowCandidates(!showCandidates); setShowHistory(false); }}
          >
            <FileCheck className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={showHistory ? 'default' : 'outline'}
            onClick={() => { setShowHistory(!showHistory); setShowCandidates(false); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Candidates */}
        {showCandidates && candidatesData && candidatesData.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <FileCheck className="h-3 w-3" />
              Pending Candidates
            </p>
            <ScrollArea className="h-40">
              <div className="space-y-2 pr-3">
                {candidatesData.map((candidate) => {
                  const gatesPassed = (candidate.gates_passed as GateResults)?.all_passed;
                  return (
                    <div 
                      key={candidate.id} 
                      className={`p-2 rounded border ${
                        gatesPassed 
                          ? 'bg-emerald-500/5 border-emerald-500/20' 
                          : 'bg-amber-500/5 border-amber-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">v{candidate.version_number}</span>
                          {getStatusBadge('candidate', gatesPassed)}
                        </div>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(candidate.promoted_at!), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="text-xs text-muted-foreground mb-2">
                        {(candidate.performance_summary as PerformanceSummary)?.qualified_count || 0}/
                        {(candidate.performance_summary as PerformanceSummary)?.agent_count} qualified
                      </div>
                      
                      <Button
                        size="sm"
                        className="w-full h-7"
                        disabled={!gatesPassed || isActivating === candidate.id}
                        onClick={() => handleActivate(candidate.id!, candidate.version_number!)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {isActivating === candidate.id ? 'Activating...' : gatesPassed ? 'Activate' : 'Gates Failed'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {showCandidates && (!candidatesData || candidatesData.length === 0) && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No pending candidates
          </p>
        )}

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
                      snapshot.status === 'active'
                        ? 'bg-primary/10 border-primary/30' 
                        : 'bg-muted/20 border-transparent hover:border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono">v{snapshot.version_number}</span>
                      {getStatusBadge(snapshot.status!, (snapshot.gates_passed as GateResults)?.all_passed)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(snapshot.promoted_at!), { addSuffix: true })}
                      </span>
                      {snapshot.status !== 'active' && snapshot.status !== 'candidate' && (
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
