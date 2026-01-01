import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// PROMOTION GATES - Per-Agent and Snapshot-Level Requirements
// =============================================================================
const AGENT_GATES = {
  min_trades: 20,           // Minimum trades to be considered
  max_drawdown: 0.15,       // Maximum 15% drawdown
  min_pnl: -0.02,           // At least -2% PnL (allow for fees)
  min_sharpe: 0.3,          // Minimum Sharpe ratio
};

const SNAPSHOT_GATES = {
  min_qualified_agents: 5,  // Need at least 5 agents passing per-agent gates
  max_aggregate_drawdown: 0.10,  // Max 10% aggregate drawdown
  min_strategy_diversity: 2,     // At least 2 different strategy types
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
  gates_passed: boolean;
  gate_failures: string[];
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

// Validate an individual agent against gates
function validateAgentGates(agent: Omit<AgentSnapshot, 'gates_passed' | 'gate_failures'>): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (agent.total_trades < AGENT_GATES.min_trades) {
    failures.push(`trades:${agent.total_trades}<${AGENT_GATES.min_trades}`);
  }
  if (agent.max_drawdown > AGENT_GATES.max_drawdown) {
    failures.push(`drawdown:${(agent.max_drawdown * 100).toFixed(1)}%>${(AGENT_GATES.max_drawdown * 100).toFixed(0)}%`);
  }
  if (agent.net_pnl < AGENT_GATES.min_pnl) {
    failures.push(`pnl:${(agent.net_pnl * 100).toFixed(1)}%<${(AGENT_GATES.min_pnl * 100).toFixed(0)}%`);
  }
  if (agent.sharpe_ratio < AGENT_GATES.min_sharpe) {
    failures.push(`sharpe:${agent.sharpe_ratio.toFixed(2)}<${AGENT_GATES.min_sharpe}`);
  }
  
  return { passed: failures.length === 0, failures };
}

// Validate snapshot-level gates
function validateSnapshotGates(qualifiedAgents: AgentSnapshot[]): GateResults['snapshot_gates'] {
  const strategies = new Set(qualifiedAgents.map(a => a.strategy_template));
  const aggregateDrawdown = qualifiedAgents.length > 0 
    ? Math.max(...qualifiedAgents.map(a => a.max_drawdown)) 
    : 0;
  
  return {
    min_qualified_agents: {
      required: SNAPSHOT_GATES.min_qualified_agents,
      actual: qualifiedAgents.length,
      passed: qualifiedAgents.length >= SNAPSHOT_GATES.min_qualified_agents,
    },
    max_aggregate_drawdown: {
      threshold: SNAPSHOT_GATES.max_aggregate_drawdown,
      actual: aggregateDrawdown,
      passed: aggregateDrawdown <= SNAPSHOT_GATES.max_aggregate_drawdown,
    },
    min_strategy_diversity: {
      required: SNAPSHOT_GATES.min_strategy_diversity,
      actual: strategies.size,
      passed: strategies.size >= SNAPSHOT_GATES.min_strategy_diversity,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, snapshotId, notes, minTrades = 3, topN = 10, generationId, autoActivate = false } = await req.json();

    // =========================================================================
    // ACTION: create-candidate - Create a candidate snapshot with gate validation
    // =========================================================================
    if (action === 'create-candidate' || action === 'promote') {
      const isCandidate = action === 'create-candidate';
      console.log(`[promote-brain] Creating ${isCandidate ? 'candidate' : 'active'} brain snapshot...`);

      // Get generation ID from param or current
      let targetGenerationId = generationId;
      if (!targetGenerationId) {
        const { data: systemState, error: stateError } = await supabase
          .from('system_state')
          .select('current_generation_id')
          .limit(1)
          .single();

        if (stateError || !systemState?.current_generation_id) {
          throw new Error('No active generation found');
        }
        targetGenerationId = systemState.current_generation_id;
      }

      // Get agents with performance data for this generation
      const { data: agentIds, error: agentIdsError } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', targetGenerationId);

      if (agentIdsError) throw agentIdsError;

      const ids = agentIds?.map(a => a.agent_id) || [];
      
      if (ids.length === 0) {
        throw new Error('No agents found in generation');
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
        .eq('generation_id', targetGenerationId)
        .in('agent_id', ids);

      if (perfError) throw perfError;

      // Create a map of agent_id -> performance
      const perfMap = new Map(performance?.map(p => [p.agent_id, p]) || []);

      // Build agent snapshots with performance and gate validation
      const allAgentSnapshots: AgentSnapshot[] = (agents || [])
        .map(agent => {
          const perf = perfMap.get(agent.id);
          const baseSnapshot = {
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
          
          const gateResult = validateAgentGates(baseSnapshot);
          return {
            ...baseSnapshot,
            gates_passed: gateResult.passed,
            gate_failures: gateResult.failures,
          };
        })
        // Sort by fitness descending
        .sort((a, b) => b.fitness_score - a.fitness_score);

      // Separate qualified and unqualified agents
      const qualifiedAgents = allAgentSnapshots.filter(a => a.gates_passed);
      const topQualified = qualifiedAgents.slice(0, topN);

      // Validate snapshot-level gates
      const snapshotGates = validateSnapshotGates(topQualified);
      const allSnapshotGatesPassed = Object.values(snapshotGates).every(g => g.passed);
      
      // Build gate results
      const failuresByGate: Record<string, number> = {};
      allAgentSnapshots.forEach(a => {
        a.gate_failures.forEach(f => {
          const gateName = f.split(':')[0];
          failuresByGate[gateName] = (failuresByGate[gateName] || 0) + 1;
        });
      });

      const gateResults: GateResults = {
        agent_gates: {
          total_evaluated: allAgentSnapshots.length,
          passed: qualifiedAgents.length,
          failed: allAgentSnapshots.length - qualifiedAgents.length,
          failures_by_gate: failuresByGate,
        },
        snapshot_gates: snapshotGates,
        all_passed: allSnapshotGatesPassed && qualifiedAgents.length >= SNAPSHOT_GATES.min_qualified_agents,
      };

      // For candidates, we always create (even if gates fail) - they're just not activatable
      // For direct promote, we require gates to pass
      if (action === 'promote' && !gateResults.all_passed) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'Gates not passed - cannot promote directly. Use create-candidate instead.',
            gate_results: gateResults,
            agents_checked: allAgentSnapshots.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Select agents to include (qualified ones, up to topN)
      const includedAgents = topQualified.length > 0 ? topQualified : allAgentSnapshots.slice(0, topN);
      
      if (includedAgents.length === 0) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'No agents available for snapshot',
            gate_results: gateResults,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate performance summary
      const performanceSummary = {
        agent_count: includedAgents.length,
        qualified_count: qualifiedAgents.length,
        avg_fitness: includedAgents.reduce((s, a) => s + a.fitness_score, 0) / includedAgents.length,
        total_pnl: includedAgents.reduce((s, a) => s + a.net_pnl, 0),
        avg_trades: includedAgents.reduce((s, a) => s + a.total_trades, 0) / includedAgents.length,
        max_drawdown: Math.max(...includedAgents.map(a => a.max_drawdown)),
        strategy_breakdown: includedAgents.reduce((acc, a) => {
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

      // Determine status and is_active
      const shouldActivate = action === 'promote' || (isCandidate && autoActivate && gateResults.all_passed);
      const snapshotStatus = shouldActivate ? 'active' : 'candidate';

      // If activating, deactivate current active snapshot
      if (shouldActivate) {
        await supabase
          .from('live_brain_snapshots')
          .update({ is_active: false, status: 'inactive' })
          .eq('is_active', true);
      }

      // Create new snapshot
      const { data: newSnapshot, error: insertError } = await supabase
        .from('live_brain_snapshots')
        .insert({
          version_number: nextVersion,
          source_generation_id: targetGenerationId,
          agent_snapshots: includedAgents,
          performance_summary: performanceSummary,
          is_active: shouldActivate,
          status: snapshotStatus,
          gates_passed: gateResults,
          gates_validated_at: new Date().toISOString(),
          notes: notes || `${isCandidate ? 'Candidate' : 'Promoted'} v${nextVersion} - ${qualifiedAgents.length}/${allAgentSnapshots.length} qualified`,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update system_state with active brain version if activated
      if (shouldActivate) {
        await supabase
          .from('system_state')
          .update({ active_brain_version_id: newSnapshot.id })
          .not('id', 'is', null);
      }

      // Log control event
      await supabase
        .from('control_events')
        .insert({
          action: isCandidate ? 'brain_candidate_created' : 'brain_promoted',
          metadata: {
            version: nextVersion,
            snapshot_id: newSnapshot.id,
            agent_count: includedAgents.length,
            qualified_count: qualifiedAgents.length,
            gates_passed: gateResults.all_passed,
            gate_results: gateResults,
            source_generation_id: targetGenerationId,
            activated: shouldActivate,
          },
        });

      console.log(`[promote-brain] Created ${snapshotStatus} snapshot v${nextVersion} with ${includedAgents.length} agents (${qualifiedAgents.length} qualified)`);

      return new Response(
        JSON.stringify({
          ok: true,
          snapshot: newSnapshot,
          summary: performanceSummary,
          gate_results: gateResults,
          status: snapshotStatus,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION: activate - Activate a candidate snapshot (with gate check)
    // =========================================================================
    if (action === 'activate') {
      if (!snapshotId) {
        throw new Error('snapshotId required for activation');
      }

      console.log(`[promote-brain] Activating candidate ${snapshotId}...`);

      // Get the candidate
      const { data: candidate, error: getError } = await supabase
        .from('live_brain_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (getError || !candidate) {
        throw new Error('Snapshot not found');
      }

      // Check gates
      const gateResults = candidate.gates_passed as GateResults;
      if (!gateResults?.all_passed) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'Cannot activate - gates not passed',
            gate_results: gateResults,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deactivate current
      await supabase
        .from('live_brain_snapshots')
        .update({ is_active: false, status: 'inactive' })
        .eq('is_active', true);

      // Activate target
      const { data: activated, error: activateError } = await supabase
        .from('live_brain_snapshots')
        .update({ is_active: true, status: 'active' })
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
          action: 'brain_activated',
          metadata: {
            snapshot_id: snapshotId,
            version: activated.version_number,
            from_candidate: true,
          },
        });

      console.log(`[promote-brain] Activated v${activated.version_number}`);

      return new Response(
        JSON.stringify({ ok: true, snapshot: activated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION: rollback - Activate a previous snapshot
    // =========================================================================
    if (action === 'rollback') {
      if (!snapshotId) {
        throw new Error('snapshotId required for rollback');
      }

      console.log(`[promote-brain] Rolling back to snapshot ${snapshotId}...`);

      // Deactivate current
      await supabase
        .from('live_brain_snapshots')
        .update({ is_active: false, status: 'inactive' })
        .eq('is_active', true);

      // Activate target
      const { data: activated, error: activateError } = await supabase
        .from('live_brain_snapshots')
        .update({ is_active: true, status: 'active' })
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

    // =========================================================================
    // ACTION: get - Get current active snapshot
    // =========================================================================
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

    // =========================================================================
    // ACTION: get-candidates - Get pending candidate snapshots
    // =========================================================================
    if (action === 'get-candidates') {
      const { data: candidates, error: listError } = await supabase
        .from('live_brain_snapshots')
        .select('id, version_number, promoted_at, status, notes, performance_summary, gates_passed, gates_validated_at')
        .eq('status', 'candidate')
        .order('version_number', { ascending: false })
        .limit(10);

      if (listError) throw listError;

      return new Response(
        JSON.stringify({ ok: true, candidates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION: list - List all snapshots
    // =========================================================================
    if (action === 'list') {
      const { data: snapshots, error: listError } = await supabase
        .from('live_brain_snapshots')
        .select('id, version_number, promoted_at, is_active, status, notes, performance_summary, gates_passed')
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
