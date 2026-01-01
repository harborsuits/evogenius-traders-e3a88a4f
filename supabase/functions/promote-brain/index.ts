import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, snapshotId, notes, minTrades = 3, topN = 10 } = await req.json();

    // Action: promote - create a new snapshot from current elites
    if (action === 'promote') {
      console.log('[promote-brain] Creating new brain snapshot...');

      // Get current generation
      const { data: systemState, error: stateError } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .limit(1)
        .single();

      if (stateError || !systemState?.current_generation_id) {
        throw new Error('No active generation found');
      }

      const generationId = systemState.current_generation_id;

      // Get agents with performance data for this generation
      const { data: agentIds, error: agentIdsError } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', generationId);

      if (agentIdsError) throw agentIdsError;

      const ids = agentIds?.map(a => a.agent_id) || [];
      
      if (ids.length === 0) {
        throw new Error('No agents found in current generation');
      }

      // Get agents with their details
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, strategy_template, genes, is_elite, role, status')
        .in('id', ids)
        .in('status', ['elite', 'active']);

      if (agentsError) throw agentsError;

      // Get performance data
      const { data: performance, error: perfError } = await supabase
        .from('performance')
        .select('agent_id, fitness_score, net_pnl, total_trades, max_drawdown, sharpe_ratio')
        .eq('generation_id', generationId)
        .in('agent_id', ids);

      if (perfError) throw perfError;

      // Create a map of agent_id -> performance
      const perfMap = new Map(performance?.map(p => [p.agent_id, p]) || []);

      // Build agent snapshots with performance
      const agentSnapshots: AgentSnapshot[] = (agents || [])
        .map(agent => {
          const perf = perfMap.get(agent.id);
          return {
            agent_id: agent.id,
            strategy_template: agent.strategy_template,
            genes: agent.genes as Record<string, number>,
            fitness_score: perf?.fitness_score ?? 0,
            net_pnl: perf?.net_pnl ?? 0,
            total_trades: perf?.total_trades ?? 0,
            max_drawdown: perf?.max_drawdown ?? 0,
            sharpe_ratio: perf?.sharpe_ratio ?? 0,
            is_elite: agent.is_elite,
            role: agent.role,
          };
        })
        // Filter to those with minimum trades
        .filter(a => a.total_trades >= minTrades)
        // Sort by fitness descending
        .sort((a, b) => b.fitness_score - a.fitness_score)
        // Take top N
        .slice(0, topN);

      if (agentSnapshots.length === 0) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: `No agents meet minimum trade requirement (${minTrades} trades)`,
            agentsChecked: agents?.length || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate performance summary
      const performanceSummary = {
        agent_count: agentSnapshots.length,
        avg_fitness: agentSnapshots.reduce((s, a) => s + a.fitness_score, 0) / agentSnapshots.length,
        total_pnl: agentSnapshots.reduce((s, a) => s + a.net_pnl, 0),
        avg_trades: agentSnapshots.reduce((s, a) => s + a.total_trades, 0) / agentSnapshots.length,
        max_drawdown: Math.max(...agentSnapshots.map(a => a.max_drawdown)),
        strategy_breakdown: agentSnapshots.reduce((acc, a) => {
          acc[a.strategy_template] = (acc[a.strategy_template] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      // Get next version number
      const { data: lastVersion } = await supabase
        .from('live_brain_snapshots')
        .select('version_number')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (lastVersion?.version_number || 0) + 1;

      // Deactivate current active snapshot
      await supabase
        .from('live_brain_snapshots')
        .update({ is_active: false })
        .eq('is_active', true);

      // Create new snapshot
      const { data: newSnapshot, error: insertError } = await supabase
        .from('live_brain_snapshots')
        .insert({
          version_number: nextVersion,
          source_generation_id: generationId,
          agent_snapshots: agentSnapshots,
          performance_summary: performanceSummary,
          is_active: true,
          notes: notes || `Promoted top ${agentSnapshots.length} agents with ${minTrades}+ trades`,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update system_state with active brain version
      await supabase
        .from('system_state')
        .update({ active_brain_version_id: newSnapshot.id })
        .not('id', 'is', null);

      // Log control event
      await supabase
        .from('control_events')
        .insert({
          action: 'brain_promoted',
          metadata: {
            version: nextVersion,
            snapshot_id: newSnapshot.id,
            agent_count: agentSnapshots.length,
            avg_fitness: performanceSummary.avg_fitness,
            source_generation_id: generationId,
          },
        });

      console.log(`[promote-brain] Created snapshot v${nextVersion} with ${agentSnapshots.length} agents`);

      return new Response(
        JSON.stringify({
          ok: true,
          snapshot: newSnapshot,
          summary: performanceSummary,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: rollback - activate a previous snapshot
    if (action === 'rollback') {
      if (!snapshotId) {
        throw new Error('snapshotId required for rollback');
      }

      console.log(`[promote-brain] Rolling back to snapshot ${snapshotId}...`);

      // Deactivate current
      await supabase
        .from('live_brain_snapshots')
        .update({ is_active: false })
        .eq('is_active', true);

      // Activate target
      const { data: activated, error: activateError } = await supabase
        .from('live_brain_snapshots')
        .update({ is_active: true })
        .eq('id', snapshotId)
        .select()
        .single();

      if (activateError) throw activateError;

      // Update system_state
      await supabase
        .from('system_state')
        .update({ active_brain_version_id: snapshotId })
        .not('id', 'is', null);

      // Log control event
      await supabase
        .from('control_events')
        .insert({
          action: 'brain_rollback',
          metadata: {
            snapshot_id: snapshotId,
            version: activated.version_number,
          },
        });

      console.log(`[promote-brain] Rolled back to v${activated.version_number}`);

      return new Response(
        JSON.stringify({ ok: true, snapshot: activated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: get - get current active snapshot
    if (action === 'get') {
      const { data: active, error: getError } = await supabase
        .from('live_brain_snapshots')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (getError) throw getError;

      return new Response(
        JSON.stringify({ ok: true, snapshot: active }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: list - list all snapshots
    if (action === 'list') {
      const { data: snapshots, error: listError } = await supabase
        .from('live_brain_snapshots')
        .select('id, version_number, promoted_at, is_active, notes, performance_summary')
        .order('version_number', { ascending: false })
        .limit(20);

      if (listError) throw listError;

      return new Response(
        JSON.stringify({ ok: true, snapshots }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[promote-brain] Error:', message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
