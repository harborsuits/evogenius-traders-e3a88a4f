import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SystemVitals {
  // Decision throughput
  decisionsLastHour: number;
  evalRatePct: number;
  tradeRatePct: number;
  
  // Agent heartbeat
  activeAgents: number;
  staleAgents: number;
  worstStaleMinutes: number | null;
  
  // Learning tick
  lastFitnessCalc: string | null;
  lastAdaptiveTuning: string | null;
  lastSelectionBreeding: string | null;
  
  // Status indicators
  heartbeatStatus: 'green' | 'yellow' | 'red';
  evalStatus: 'green' | 'yellow' | 'red';
  learningStatus: 'green' | 'yellow' | 'red';
}

export function useSystemVitals() {
  return useQuery({
    queryKey: ['system-vitals'],
    queryFn: async (): Promise<SystemVitals> => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const staleThreshold = new Date(now.getTime() - 10 * 60 * 1000); // 10 min
      
      // Fetch all data in parallel
      const [decisionsResult, learningResult, agentsResult, tradesResult] = await Promise.all([
        // Decision throughput (last 6 hours)
        supabase
          .from('control_events')
          .select('metadata, triggered_at')
          .eq('action', 'trade_decision')
          .gte('triggered_at', sixHoursAgo.toISOString()),
        
        // Learning events
        supabase
          .from('control_events')
          .select('action, triggered_at')
          .in('action', ['fitness_calculated', 'adaptive_tuning_update', 'selection_breeding'])
          .gte('triggered_at', oneDayAgo.toISOString())
          .order('triggered_at', { ascending: false }),
        
        // Active agents
        supabase
          .from('agents')
          .select('id, status')
          .in('status', ['elite', 'active']),
        
        // Trades executed (last 6 hours)
        supabase
          .from('control_events')
          .select('triggered_at')
          .eq('action', 'trade_executed')
          .gte('triggered_at', sixHoursAgo.toISOString()),
      ]);
      
      // Process decisions
      const decisions = decisionsResult.data || [];
      const lastHourDecisions = decisions.filter(d => 
        new Date(d.triggered_at) >= oneHourAgo
      );
      
      const decisionsLastHour = lastHourDecisions.length;
      
      // Calculate eval rate (decisions with evaluations)
      const withEvals = decisions.filter(d => {
        const meta = d.metadata as Record<string, unknown> | null;
        const evals = meta?.evaluations;
        return Array.isArray(evals) && evals.length > 0;
      }).length;
      const evalRatePct = decisions.length > 0 
        ? Math.round((withEvals / decisions.length) * 100) 
        : 0;
      
      // Trade rate
      const tradesExecuted = tradesResult.data?.length || 0;
      const tradeRatePct = decisions.length > 0 
        ? Math.round((tradesExecuted / decisions.length) * 100) 
        : 0;
      
      // Agent heartbeat - get last decision per agent
      const { data: agentDecisions } = await supabase
        .from('control_events')
        .select('metadata, triggered_at')
        .eq('action', 'trade_decision')
        .gte('triggered_at', oneDayAgo.toISOString());
      
      const agentLastDecision = new Map<string, Date>();
      (agentDecisions || []).forEach(d => {
        const meta = d.metadata as Record<string, unknown> | null;
        const agentId = meta?.agent_id as string;
        if (agentId) {
          const ts = new Date(d.triggered_at);
          const existing = agentLastDecision.get(agentId);
          if (!existing || ts > existing) {
            agentLastDecision.set(agentId, ts);
          }
        }
      });
      
      const activeAgentIds = new Set((agentsResult.data || []).map(a => a.id));
      const activeAgents = activeAgentIds.size;
      
      let staleAgents = 0;
      let worstStaleMinutes: number | null = null;
      
      activeAgentIds.forEach(agentId => {
        const lastDecision = agentLastDecision.get(agentId);
        if (!lastDecision || lastDecision < staleThreshold) {
          staleAgents++;
          if (lastDecision) {
            const staleMinutes = Math.round((now.getTime() - lastDecision.getTime()) / 60000);
            if (worstStaleMinutes === null || staleMinutes > worstStaleMinutes) {
              worstStaleMinutes = staleMinutes;
            }
          }
        }
      });
      
      // Learning timestamps
      const learningEvents = learningResult.data || [];
      const lastFitnessCalc = learningEvents.find(e => e.action === 'fitness_calculated')?.triggered_at || null;
      const lastAdaptiveTuning = learningEvents.find(e => e.action === 'adaptive_tuning_update')?.triggered_at || null;
      const lastSelectionBreeding = learningEvents.find(e => e.action === 'selection_breeding')?.triggered_at || null;
      
      // Status indicators
      let heartbeatStatus: 'green' | 'yellow' | 'red' = 'green';
      if (worstStaleMinutes !== null) {
        if (worstStaleMinutes > 30) heartbeatStatus = 'red';
        else if (worstStaleMinutes > 10) heartbeatStatus = 'yellow';
      }
      
      let evalStatus: 'green' | 'yellow' | 'red' = 'green';
      if (evalRatePct < 10) evalStatus = 'red';
      else if (evalRatePct < 50) evalStatus = 'yellow';
      
      let learningStatus: 'green' | 'yellow' | 'red' = 'green';
      if (!lastFitnessCalc) {
        learningStatus = 'red';
      } else {
        const fitnessAge = (now.getTime() - new Date(lastFitnessCalc).getTime()) / 60000;
        if (fitnessAge > 60) learningStatus = 'red';
        else if (fitnessAge > 30) learningStatus = 'yellow';
      }
      
      return {
        decisionsLastHour,
        evalRatePct,
        tradeRatePct,
        activeAgents,
        staleAgents,
        worstStaleMinutes,
        lastFitnessCalc,
        lastAdaptiveTuning,
        lastSelectionBreeding,
        heartbeatStatus,
        evalStatus,
        learningStatus,
      };
    },
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 15000,
  });
}
