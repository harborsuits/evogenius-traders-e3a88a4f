import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { usePaperAccount } from '@/hooks/usePaperTrading';

interface AlertRule {
  type: string;
  scope: 'agent' | 'generation' | 'account';
  check: (data: any) => { triggered: boolean; severity: 'info' | 'warn' | 'crit'; title: string; message: string; scopeId: string } | null;
}

export function usePerformanceAlerts() {
  const queryClient = useQueryClient();
  const { data: systemState } = useSystemState();
  const { data: account } = usePaperAccount();
  const lastRunRef = useRef<number>(0);

  // Fetch existing alerts for deduplication
  const { data: existingAlerts = [] } = useQuery({
    queryKey: ['performance-alerts-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('performance_alerts')
        .select('id, metadata')
        .eq('is_ack', false);
      return data || [];
    },
    staleTime: 30000,
  });

  // Fetch agents with performance
  const { data: agentsWithPerf = [] } = useQuery({
    queryKey: ['agents-perf-for-alerts', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return [];
      
      const { data: cohort } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', systemState.current_generation_id);
      
      if (!cohort?.length) return [];
      
      const agentIds = cohort.map(c => c.agent_id);
      
      const { data: perfData } = await supabase
        .from('performance')
        .select('*')
        .eq('generation_id', systemState.current_generation_id)
        .in('agent_id', agentIds);
      
      return perfData || [];
    },
    enabled: !!systemState?.current_generation_id && systemState?.status === 'running',
    staleTime: 60000,
  });

  // Fetch generation fills count
  const { data: generationFillsCount = 0 } = useQuery({
    queryKey: ['generation-fills-count', account?.id, systemState?.current_generation_id],
    queryFn: async () => {
      if (!account?.id || !systemState?.current_generation_id) return 0;
      
      const { count } = await supabase
        .from('paper_orders')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id)
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled');
      
      return count || 0;
    },
    enabled: !!account?.id && !!systemState?.current_generation_id,
    staleTime: 60000,
  });

  // Insert alert mutation
  const insertAlertMutation = useMutation({
    mutationFn: async (alert: {
      scope: string;
      scope_id: string;
      severity: string;
      type: string;
      title: string;
      message: string;
      metadata: any;
    }) => {
      const { error } = await supabase
        .from('performance_alerts')
        .insert(alert);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['performance-alerts-active'] });
    },
  });

  // Check if alert already exists
  const alertExists = (dedupeKey: string) => {
    return existingAlerts.some((a: any) => 
      a.metadata?.dedupe_key === dedupeKey
    );
  };

  // Evaluate rules
  useEffect(() => {
    // Only run if system is RUNNING
    if (systemState?.status !== 'running') return;
    if (!systemState?.current_generation_id) return;
    
    // Throttle: only run once per 60 seconds
    const now = Date.now();
    if (now - lastRunRef.current < 60000) return;
    lastRunRef.current = now;

    const generationId = systemState.current_generation_id;

    // Define alert rules
    const rules: AlertRule[] = [
      // Agent drawdown warn >= 12%
      {
        type: 'agent_drawdown_warn',
        scope: 'agent',
        check: (perf) => {
          if (!perf.max_drawdown || perf.max_drawdown < 0.12 || perf.max_drawdown >= 0.20) return null;
          return {
            triggered: true,
            severity: 'warn',
            title: 'Agent Drawdown Warning',
            message: `Agent ${perf.agent_id.slice(0, 8)} has ${(perf.max_drawdown * 100).toFixed(1)}% drawdown`,
            scopeId: perf.agent_id,
          };
        },
      },
      // Agent drawdown crit >= 20%
      {
        type: 'agent_drawdown_crit',
        scope: 'agent',
        check: (perf) => {
          if (!perf.max_drawdown || perf.max_drawdown < 0.20) return null;
          return {
            triggered: true,
            severity: 'crit',
            title: 'Critical Agent Drawdown',
            message: `Agent ${perf.agent_id.slice(0, 8)} has ${(perf.max_drawdown * 100).toFixed(1)}% drawdown - exceeds threshold`,
            scopeId: perf.agent_id,
          };
        },
      },
      // Sharpe warn if < 0 AND total_trades >= 10
      {
        type: 'agent_negative_sharpe',
        scope: 'agent',
        check: (perf) => {
          if (perf.sharpe_ratio == null || perf.sharpe_ratio >= 0) return null;
          if (perf.total_trades < 10) return null;
          return {
            triggered: true,
            severity: 'warn',
            title: 'Negative Sharpe Ratio',
            message: `Agent ${perf.agent_id.slice(0, 8)} has negative Sharpe (${perf.sharpe_ratio.toFixed(2)}) with ${perf.total_trades} trades`,
            scopeId: perf.agent_id,
          };
        },
      },
      // No trades info if total_trades == 0 AND generation has > 10 fills
      {
        type: 'agent_no_trades',
        scope: 'agent',
        check: (perf) => {
          if (perf.total_trades > 0) return null;
          if (generationFillsCount <= 10) return null;
          return {
            triggered: true,
            severity: 'info',
            title: 'Inactive Agent',
            message: `Agent ${perf.agent_id.slice(0, 8)} has 0 trades while generation has ${generationFillsCount} total fills`,
            scopeId: perf.agent_id,
          };
        },
      },
    ];

    // Evaluate each agent's performance
    agentsWithPerf.forEach((perf: any) => {
      rules.forEach(rule => {
        const result = rule.check(perf);
        if (!result) return;

        const dedupeKey = `${rule.type}:${result.scopeId}:${generationId}`;
        if (alertExists(dedupeKey)) return;

        insertAlertMutation.mutate({
          scope: rule.scope,
          scope_id: result.scopeId,
          severity: result.severity,
          type: rule.type,
          title: result.title,
          message: result.message,
          metadata: { dedupe_key: dedupeKey, generation_id: generationId },
        });
      });
    });
  }, [systemState, agentsWithPerf, generationFillsCount, existingAlerts]);

  return null;
}
