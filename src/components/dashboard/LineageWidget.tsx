import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGenerationSelection } from '@/hooks/useGenerationSelection';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Users } from 'lucide-react';

interface AgentLineage {
  agent_id: string;
  fills: number;
  strategy_template: string;
  is_elite: boolean;
  was_prev_gen_active: boolean;
  lineage_type: 'elite' | 'parent' | 'offspring' | 'seed';
}

interface LineageWidgetProps {
  currentGenNumber?: number;
  compareGenNumber?: number;
}

export function LineageWidget({ currentGenNumber: propCurrentGen, compareGenNumber: propCompareGen }: LineageWidgetProps) {
  // Use hook if props not provided
  const selection = useGenerationSelection();
  const currentGenNumber = propCurrentGen ?? selection.currentGenNumber;
  const compareGenNumber = propCompareGen ?? selection.compareGenNumber;

  const { data, isLoading } = useQuery({
    queryKey: ['agent-lineage', currentGenNumber, compareGenNumber],
    queryFn: async () => {
      if (currentGenNumber === null) return { traders: [], total: 0, currentGenNumber: null, prevGenNumber: null };

      // Get current generation by number
      const { data: currentGen } = await supabase
        .from('generations')
        .select('id, generation_number, start_time')
        .eq('generation_number', currentGenNumber)
        .maybeSingle();

      if (!currentGen) return { traders: [], total: 0, currentGenNumber: null, prevGenNumber: null };

      const currentGenId = currentGen.id;

      // Get previous/compare generation by number
      let prevGen = null;
      const prevGenNum = compareGenNumber ?? (currentGenNumber > 1 ? currentGenNumber - 1 : null);
      if (prevGenNum !== null) {
        const { data: prevData } = await supabase
          .from('generations')
          .select('id, generation_number, start_time')
          .eq('generation_number', prevGenNum)
          .maybeSingle();
        prevGen = prevData;
      }

      // Get agents in current generation with fill counts
      const { data: fills } = await supabase
        .from('paper_orders')
        .select('agent_id, tags')
        .eq('generation_id', currentGenId)
        .eq('status', 'filled');

      // Filter out test_mode and count fills per agent
      const fillCounts = new Map<string, number>();
      fills?.forEach(f => {
        const tags = f.tags as Record<string, unknown> | null;
        if (tags?.test_mode) return;
        fillCounts.set(f.agent_id, (fillCounts.get(f.agent_id) ?? 0) + 1);
      });

      // Get previous generation active agents
      const prevGenActiveAgents = new Set<string>();
      if (prevGen) {
        const { data: prevGenFills } = await supabase
          .from('paper_orders')
          .select('agent_id, tags')
          .eq('generation_id', prevGen.id)
          .eq('status', 'filled');
        
        prevGenFills?.forEach(f => {
          const tags = f.tags as Record<string, unknown> | null;
          if (!tags?.test_mode) {
            prevGenActiveAgents.add(f.agent_id);
          }
        });
      }

      // Get agent details
      const tradingAgentIds = [...fillCounts.keys()];
      if (tradingAgentIds.length === 0) return { 
        traders: [], 
        total: 0, 
        currentGenNumber: currentGen.generation_number, 
        prevGenNumber: prevGen?.generation_number ?? null 
      };

      const { data: agents } = await supabase
        .from('agents')
        .select('id, strategy_template, is_elite, status, created_at')
        .in('id', tradingAgentIds);

      if (!agents) return { 
        traders: [], 
        total: 0, 
        currentGenNumber: currentGen.generation_number, 
        prevGenNumber: prevGen?.generation_number ?? null 
      };

      // Determine lineage type based on creation time vs current gen start
      const currentGenStart = currentGen.start_time ? new Date(currentGen.start_time).getTime() : Date.now();
      
      const traders: AgentLineage[] = agents.map(agent => {
        const createdAt = new Date(agent.created_at).getTime();
        const isNewOffspring = createdAt >= currentGenStart - 60000; // Within 1 min of gen start
        
        let lineageType: 'elite' | 'parent' | 'offspring' | 'seed';
        if (agent.is_elite) {
          lineageType = 'elite';
        } else if (isNewOffspring) {
          lineageType = 'offspring';
        } else if (prevGenActiveAgents.has(agent.id)) {
          lineageType = 'parent';
        } else {
          lineageType = 'seed';
        }

        return {
          agent_id: agent.id,
          fills: fillCounts.get(agent.id) ?? 0,
          strategy_template: agent.strategy_template,
          is_elite: agent.is_elite,
          was_prev_gen_active: prevGenActiveAgents.has(agent.id),
          lineage_type: lineageType,
        };
      }).sort((a, b) => b.fills - a.fills);

      return { 
        traders, 
        total: tradingAgentIds.length,
        currentGenNumber: currentGen.generation_number,
        prevGenNumber: prevGen?.generation_number ?? null
      };
    },
    enabled: currentGenNumber !== null,
    refetchInterval: 30000,
  });

  const lineageBadgeColor = (type: string) => {
    switch (type) {
      case 'elite': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'parent': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'offspring': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const currentGenLabel = data?.currentGenNumber ? `Gen ${data.currentGenNumber}` : 'Current Gen';
  const prevGenLabel = data?.prevGenNumber ? `Gen${data.prevGenNumber}` : 'Prev Gen';

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{currentGenLabel} Lineage</span>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {data?.total ?? 0} traders
        </Badge>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-4">Loading...</div>
        ) : data?.traders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">No traders yet</div>
        ) : (
          <div className="space-y-1.5 pr-2">
            {data?.traders.slice(0, 10).map((agent) => (
              <div
                key={agent.agent_id}
                className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={`text-[10px] px-1.5 py-0 ${lineageBadgeColor(agent.lineage_type)}`}>
                    {agent.lineage_type.toUpperCase()}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {agent.agent_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {agent.strategy_template.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono font-medium tabular-nums">
                    {agent.fills}
                  </span>
                  {agent.was_prev_gen_active ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex gap-2 text-[9px] text-muted-foreground border-t border-border/50 pt-2">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-2.5 w-2.5 text-green-500" /> {prevGenLabel} active
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-2.5 w-2.5 text-muted-foreground/50" /> New to {currentGenLabel}
        </span>
      </div>
    </div>
  );
}