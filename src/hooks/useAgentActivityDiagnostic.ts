import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentActivity {
  agent_id: string;
  strategy_template: string;
  is_elite: boolean;
  capital_allocation: number;
  trade_count: number;
  hold_count: number;
  blocked_count: number;
  last_decision_reason: string | null;
  activity_bucket: 'inactive' | 'low' | 'moderate' | 'active';
}

export interface ActivitySummary {
  total_agents: number;
  inactive_count: number;
  low_activity_count: number;
  moderate_activity_count: number;
  active_count: number;
  inactive_rate: number;
  
  // Why not trading breakdown
  reasons: {
    no_signal: number;
    confidence_too_low: number;
    symbol_rotation: number;
    rate_limited: number;
    blocked_gates: number;
    unknown: number;
  };
  
  // Strategy breakdown
  by_strategy: Record<string, { total: number; active: number; inactive: number }>;
  
  agents: AgentActivity[];
}

export function useAgentActivityDiagnostic(generationId: string | null) {
  return useQuery({
    queryKey: ['agent-activity-diagnostic', generationId],
    queryFn: async (): Promise<ActivitySummary> => {
      if (!generationId) {
        return getEmptySummary();
      }

      // Get all agents in current generation cohort
      const { data: cohortAgents, error: cohortError } = await supabase
        .from('generation_agents')
        .select(`
          agent_id,
          agents!inner (
            id,
            strategy_template,
            is_elite,
            capital_allocation
          )
        `)
        .eq('generation_id', generationId);

      if (cohortError || !cohortAgents) {
        console.error('Failed to fetch cohort agents:', cohortError);
        return getEmptySummary();
      }

      // Get trade counts per agent for this generation
      const { data: orderCounts } = await supabase
        .from('paper_orders')
        .select('agent_id')
        .eq('generation_id', generationId)
        .eq('status', 'filled')
        .not('tags->>test_mode', 'eq', 'true');

      // Count trades per agent
      const tradesByAgent: Record<string, number> = {};
      (orderCounts || []).forEach(o => {
        if (o.agent_id) {
          tradesByAgent[o.agent_id] = (tradesByAgent[o.agent_id] || 0) + 1;
        }
      });

      // Get recent decision logs to understand "why not trading"
      const { data: recentDecisions } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_cycle')
        .order('triggered_at', { ascending: false })
        .limit(100);

      // Analyze hold reasons from decision logs
      const holdReasons: ActivitySummary['reasons'] = {
        no_signal: 0,
        confidence_too_low: 0,
        symbol_rotation: 0,
        rate_limited: 0,
        blocked_gates: 0,
        unknown: 0,
      };

      (recentDecisions || []).forEach(d => {
        const meta = d.metadata as any;
        if (meta?.top_hold_reasons) {
          (meta.top_hold_reasons as string[]).forEach(reason => {
            if (reason.includes('no_signal')) holdReasons.no_signal++;
            else if (reason.includes('confidence')) holdReasons.confidence_too_low++;
            else if (reason.includes('rotation') || reason.includes('symbol')) holdReasons.symbol_rotation++;
            else if (reason.includes('rate') || reason.includes('limit')) holdReasons.rate_limited++;
            else if (reason.includes('block') || reason.includes('gate')) holdReasons.blocked_gates++;
            else holdReasons.unknown++;
          });
        }
      });

      // Build agent activity list
      const agents: AgentActivity[] = cohortAgents.map(ca => {
        const agent = ca.agents as any;
        const tradeCount = tradesByAgent[ca.agent_id] || 0;
        
        let activityBucket: AgentActivity['activity_bucket'] = 'inactive';
        if (tradeCount >= 5) activityBucket = 'active';
        else if (tradeCount >= 3) activityBucket = 'moderate';
        else if (tradeCount >= 1) activityBucket = 'low';

        return {
          agent_id: ca.agent_id,
          strategy_template: agent?.strategy_template || 'unknown',
          is_elite: agent?.is_elite || false,
          capital_allocation: agent?.capital_allocation || 40,
          trade_count: tradeCount,
          hold_count: 0, // Would need per-agent decision tracking
          blocked_count: 0,
          last_decision_reason: null,
          activity_bucket: activityBucket,
        };
      });

      // Calculate summary stats
      const inactive = agents.filter(a => a.activity_bucket === 'inactive');
      const low = agents.filter(a => a.activity_bucket === 'low');
      const moderate = agents.filter(a => a.activity_bucket === 'moderate');
      const active = agents.filter(a => a.activity_bucket === 'active');

      // Strategy breakdown
      const byStrategy: Record<string, { total: number; active: number; inactive: number }> = {};
      agents.forEach(a => {
        if (!byStrategy[a.strategy_template]) {
          byStrategy[a.strategy_template] = { total: 0, active: 0, inactive: 0 };
        }
        byStrategy[a.strategy_template].total++;
        if (a.activity_bucket === 'inactive') {
          byStrategy[a.strategy_template].inactive++;
        } else {
          byStrategy[a.strategy_template].active++;
        }
      });

      return {
        total_agents: agents.length,
        inactive_count: inactive.length,
        low_activity_count: low.length,
        moderate_activity_count: moderate.length,
        active_count: active.length,
        inactive_rate: Math.round((inactive.length / agents.length) * 100),
        reasons: holdReasons,
        by_strategy: byStrategy,
        agents: agents.sort((a, b) => b.trade_count - a.trade_count),
      };
    },
    enabled: !!generationId,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });
}

function getEmptySummary(): ActivitySummary {
  return {
    total_agents: 0,
    inactive_count: 0,
    low_activity_count: 0,
    moderate_activity_count: 0,
    active_count: 0,
    inactive_rate: 0,
    reasons: {
      no_signal: 0,
      confidence_too_low: 0,
      symbol_rotation: 0,
      rate_limited: 0,
      blocked_gates: 0,
      unknown: 0,
    } as ActivitySummary['reasons'],
    by_strategy: {},
    agents: [],
  };
}
