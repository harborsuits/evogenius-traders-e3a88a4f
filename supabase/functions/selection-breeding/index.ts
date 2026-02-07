import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===========================================================================
// SELECTION & BREEDING (SIMPLE PERCENTILE)
// ===========================================================================
// Selection is SCOPED to agents that participated in the ended generation
// using the generation_agents join table.
//
// Population: ~100 agents (dynamically counted)
// - Top 10% → ELITES: unchanged, retain full capital, reproduce
// - Next 15% → PARENTS: selected for breeding, survive as-is
// - Bottom 75% → REMOVED: replaced by offspring
// 
// Offspring creation:
// - Offspring count = removed count (prevents population drift)
// - Each offspring is a mutated clone of a randomly selected parent
// - Mutation: ±5-15% per gene, 10% chance of larger mutation (±20-30%)
// - All genes clamped to type-specific boundaries
// ===========================================================================

// Gene boundaries by strategy template
const GENE_BOUNDS = {
  trend_pullback: {
    EMA_fast: { min: 10, max: 30 },
    EMA_slow: { min: 100, max: 300 },
    RSI_threshold: { min: 25, max: 45 },
    TP1: { min: 0.5, max: 3.0 },
    TP2: { min: 1.0, max: 5.0 },
    Trailing_stop: { min: 0.3, max: 2.0 },
  },
  mean_reversion: {
    BB_period: { min: 10, max: 30 },
    BB_stddev: { min: 1.5, max: 3.0 },
    RSI_entry: { min: 20, max: 40 },
    TP: { min: 0.5, max: 3.0 },
    Stop_loss: { min: 0.5, max: 3.0 },
  },
  breakout: {
    Lookback_period: { min: 10, max: 50 },
    Volatility_threshold: { min: 0.5, max: 2.0 },
    Volume_multiplier: { min: 1.0, max: 3.0 },
    TP: { min: 1.0, max: 5.0 },
    Trailing_stop: { min: 0.3, max: 2.0 },
  },
} as const;

type StrategyTemplate = keyof typeof GENE_BOUNDS;

interface AgentWithFitness {
  id: string;
  strategy_template: StrategyTemplate;
  genes: Record<string, number>;
  capital_allocation: number;
  is_elite: boolean;
  status: string;
  fitness_score: number;
}

// Mutate a single gene value
// FIX: Increased mutation rate from 5-15% to 30-35% to escape local maxima
function mutateGene(
  value: number,
  min: number,
  max: number,
  largeMutation: boolean
): number {
  // Standard mutation: ±30-35% (was ±5-15%)
  // Large mutation: ±40-50% (was ±20-30%)
  const mutationRange = largeMutation 
    ? 0.40 + Math.random() * 0.10  // 40-50%
    : 0.30 + Math.random() * 0.05; // 30-35%
  
  const direction = Math.random() < 0.5 ? -1 : 1;
  const mutatedValue = value * (1 + direction * mutationRange);
  
  // Clamp to bounds
  return Math.max(min, Math.min(max, mutatedValue));
}

// Create a mutated offspring from a parent
function createOffspring(
  parent: AgentWithFitness
): { strategy_template: string; genes: Record<string, number> } {
  const bounds = GENE_BOUNDS[parent.strategy_template] as Record<string, { min: number; max: number }>;
  const newGenes: Record<string, number> = {};
  
  for (const [geneName, value] of Object.entries(parent.genes)) {
    const geneBounds = bounds[geneName];
    if (geneBounds) {
      // 20% chance of large mutation for exploration (was 10%)
      const largeMutation = Math.random() < 0.20;
      newGenes[geneName] = mutateGene(value, geneBounds.min, geneBounds.max, largeMutation);
    } else {
      // Unknown gene, keep as-is
      newGenes[geneName] = value;
    }
  }
  
  return {
    strategy_template: parent.strategy_template,
    genes: newGenes,
  };
}

// Select a random parent (elites + parents) with slight fitness weighting
function selectParent(parents: AgentWithFitness[]): AgentWithFitness {
  // Simple uniform random for now - can add fitness weighting later
  return parents[Math.floor(Math.random() * parents.length)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify authentication - allow both JWT and internal secret
  const authHeader = req.headers.get('Authorization');
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  
  const isInternalCall = internalSecret && expectedSecret && internalSecret === expectedSecret;
  
  if (!isInternalCall) {
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('[selection-breeding] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[selection-breeding] Authenticated user: ${claimsData.claims.sub}`);
  } else {
    console.log('[selection-breeding] Internal call authenticated via secret');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const startTime = Date.now();
  console.log('[selection-breeding] Starting selection and breeding');

  try {
    // Parse request body for ended generation ID
    const body = await req.json().catch(() => ({}));
    const { ended_generation_id, new_generation_id } = body;

    if (!ended_generation_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ended_generation_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!new_generation_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'new_generation_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get agent IDs that participated in the ended generation
    // Using generation_agents join table for accurate cohort tracking
    const { data: cohortMembers, error: cohortError } = await supabase
      .from('generation_agents')
      .select('agent_id')
      .eq('generation_id', ended_generation_id);

    if (cohortError) {
      throw new Error(`Failed to fetch generation cohort: ${cohortError.message}`);
    }

    const cohortAgentIds = (cohortMembers ?? []).map(m => m.agent_id);
    console.log(`[selection-breeding] Ended generation cohort size: ${cohortAgentIds.length}`);

    if (cohortAgentIds.length === 0) {
      console.log('[selection-breeding] No agents in ended generation, skipping selection');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_agents_in_cohort' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get agent details ONLY for cohort members
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, strategy_template, genes, capital_allocation, is_elite, status')
      .in('id', cohortAgentIds);

    if (agentsError || !agents) {
      throw new Error(`Failed to fetch agents: ${agentsError?.message}`);
    }

    // 3. Get fitness scores for cohort from ended generation
    const { data: performances, error: perfError } = await supabase
      .from('performance')
      .select('agent_id, fitness_score')
      .eq('generation_id', ended_generation_id)
      .in('agent_id', cohortAgentIds);

    if (perfError) {
      console.error('[selection-breeding] Failed to fetch performance:', perfError);
    }

    // Map fitness scores to agents
    const fitnessMap = new Map<string, number>();
    for (const perf of performances ?? []) {
      fitnessMap.set(perf.agent_id, perf.fitness_score);
    }

    // Build agent list with fitness (default 0 for agents without trades)
    const agentsWithFitness: AgentWithFitness[] = agents.map(a => ({
      ...a,
      strategy_template: a.strategy_template as StrategyTemplate,
      genes: a.genes as Record<string, number>,
      fitness_score: fitnessMap.get(a.id) ?? 0,
    }));

    // 4. SELECTION: Rank by fitness score (descending)
    const rankedAgents = [...agentsWithFitness].sort(
      (a, b) => b.fitness_score - a.fitness_score
    );

    // Calculate dynamic tier sizes based on actual cohort size
    // FIX: Changed from 10%+15% = 25% survival to 35% survival with minimum floor
    const cohortSize = rankedAgents.length;
    
    // SURVIVOR FLOOR: At least 10 agents always survive to prevent population collapse
    const MIN_SURVIVORS = 10;
    const SURVIVAL_RATE = 0.35; // 35% survival rate (was 25%)
    const survivorCount = Math.max(MIN_SURVIVORS, Math.floor(cohortSize * SURVIVAL_RATE));
    
    // ELITE PRESERVATION: Top 3 agents always survive unchanged (no mutation)
    const ELITE_FLOOR = 3;
    const eliteCount = Math.max(ELITE_FLOOR, Math.floor(survivorCount * 0.10)); // 10% of survivors, min 3
    const parentCount = survivorCount - eliteCount;

    const elites = rankedAgents.slice(0, eliteCount);
    const parents = rankedAgents.slice(eliteCount, survivorCount);
    const removed = rankedAgents.slice(survivorCount);

    console.log(`[selection-breeding] Selection from ${cohortSize}: ${elites.length} elites, ${parents.length} parents, ${removed.length} removed`);

    const eliteIds = elites.map(a => a.id);
    const parentIds = parents.map(a => a.id);
    const removedIds = removed.map(a => a.id);
    const survivorIds = [...eliteIds, ...parentIds];

    // 5. First, clear is_elite for ALL cohort members (reset before promotion)
    const { error: resetError } = await supabase
      .from('agents')
      .update({ is_elite: false })
      .in('id', cohortAgentIds);
    
    if (resetError) {
      console.error('[selection-breeding] Failed to reset elite flags:', resetError);
    }

    // 6. Mark elites
    if (eliteIds.length > 0) {
      const { error: eliteError } = await supabase
        .from('agents')
        .update({ is_elite: true, status: 'elite' })
        .in('id', eliteIds);

      if (eliteError) {
        console.error('[selection-breeding] Failed to update elites:', eliteError);
      }
    }

    // 7. Mark parents (active, not elite)
    if (parentIds.length > 0) {
      const { error: parentError } = await supabase
        .from('agents')
        .update({ is_elite: false, status: 'active' })
        .in('id', parentIds);

      if (parentError) {
        console.error('[selection-breeding] Failed to update parents:', parentError);
      }
    }
    
    // 8. Log elite_flags_updated audit event for verification
    await supabase.from('control_events').insert({
      action: 'elite_flags_updated',
      metadata: {
        generation_id: new_generation_id,
        elite_count: eliteIds.length,
        elite_ids: eliteIds,
        parent_count: parentIds.length,
        parent_ids: parentIds,
        source: 'selection_breeding',
      },
    });

    // 7. BREEDING: Create offspring to replace removed agents
    // Offspring count = removed count (prevents population drift)
    const breedingPool = [...elites, ...parents];
    const offspringCount = removed.length;
    const offspring: { strategy_template: string; genes: Record<string, number> }[] = [];

    for (let i = 0; i < offspringCount; i++) {
      const parent = selectParent(breedingPool);
      const child = createOffspring(parent);
      offspring.push(child);
    }

    console.log(`[selection-breeding] Created ${offspring.length} offspring (matching ${removed.length} removed)`);

    // 8. Delete removed agents
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('agents')
        .delete()
        .in('id', removedIds);

      if (deleteError) {
        console.error('[selection-breeding] Failed to delete removed agents:', deleteError);
      }
    }

    // 9. Insert offspring as new agents
    let insertedOffspringIds: string[] = [];
    if (offspring.length > 0) {
      const offspringRecords = offspring.map(o => ({
        strategy_template: o.strategy_template,
        genes: o.genes,
        generation_id: new_generation_id, // Required field - links offspring to new generation
        capital_allocation: 40, // Default allocation
        is_elite: false,
        status: 'active',
      }));

      console.log(`[selection-breeding] Inserting ${offspringRecords.length} offspring for generation ${new_generation_id}`);

      const { data: insertedOffspring, error: insertError } = await supabase
        .from('agents')
        .insert(offspringRecords)
        .select('id');

      if (insertError) {
        console.error('[selection-breeding] Failed to insert offspring:', insertError);
        console.error('[selection-breeding] Insert error details:', JSON.stringify(insertError));
      } else {
        insertedOffspringIds = (insertedOffspring ?? []).map(o => o.id);
        console.log(`[selection-breeding] Successfully inserted ${insertedOffspringIds.length} offspring`);
      }
    }

    // 10. COHORT REGISTRATION: Explicitly register the curated cohort to new generation
    // Since start_new_generation() no longer pre-registers all agents, we must add:
    // - Survivors (elites + parents)
    // - Newly created offspring
    // This prevents the 100 -> 178 drift issue
    
    const cohortIds = [...survivorIds, ...insertedOffspringIds];
    console.log(`[selection-breeding] Registering cohort of ${cohortIds.length} agents to new generation (${survivorIds.length} survivors + ${insertedOffspringIds.length} offspring)`);

    if (cohortIds.length > 0) {
      const cohortRecords = cohortIds.map(agentId => ({
        generation_id: new_generation_id,
        agent_id: agentId,
      }));

      const { error: regError } = await supabase
        .from('generation_agents')
        .insert(cohortRecords);

      if (regError) {
        console.error('[selection-breeding] Failed to register cohort to new generation:', regError);
      }
    }

    // 11. CRITICAL: Verify offspring count matches expected
    const expectedOffspring = removed.length;
    const actualOffspring = insertedOffspringIds.length;
    const offspringShortfall = expectedOffspring - actualOffspring;
    
    if (offspringShortfall > 0) {
      console.error(`[selection-breeding] CRITICAL: Offspring shortfall detected! Expected ${expectedOffspring}, got ${actualOffspring}`);
      
      // Log critical failure event
      await supabase.from('control_events').insert({
        action: 'rollover_failed',
        metadata: {
          reason: 'offspring_shortfall',
          expected_offspring: expectedOffspring,
          actual_offspring: actualOffspring,
          shortfall: offspringShortfall,
          ended_generation_id,
          new_generation_id,
          survivors: elites.length + parents.length,
        },
      });
    }

    // 12. Log selection/breeding event
    await supabase.from('control_events').insert({
      action: 'selection_breeding',
      metadata: {
        ended_generation_id,
        new_generation_id,
        cohort_size: cohortSize,
        elites_count: elites.length,
        parents_count: parents.length,
        removed_count: removed.length,
        offspring_created: actualOffspring,
        offspring_shortfall: offspringShortfall > 0 ? offspringShortfall : null,
        cohort_integrity: offspringShortfall === 0 ? 'OK' : 'FAILED',
        top_elite: elites[0] ? {
          agent_id: elites[0].id.substring(0, 8),
          fitness: elites[0].fitness_score.toFixed(4),
          strategy: elites[0].strategy_template,
        } : null,
        bottom_removed: removed[removed.length - 1] ? {
          agent_id: removed[removed.length - 1].id.substring(0, 8),
          fitness: removed[removed.length - 1].fitness_score.toFixed(4),
        } : null,
        duration_ms: Date.now() - startTime,
      },
    });

    // 12b. AUTO-CREATE CANDIDATE SNAPSHOT after rollover
    // This triggers the brain snapshot system to create a candidate for the new generation
    console.log('[selection-breeding] Creating candidate brain snapshot...');
    try {
      const promoteBrainUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/promote-brain`;
      const response = await fetch(promoteBrainUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'create-candidate',
          generationId: ended_generation_id, // Use ended generation for snapshot
          topN: 10,
          autoActivate: true, // Auto-activate if gates pass
        }),
      });
      
      const result = await response.json();
      if (result.ok) {
        const wasActivated = result.status === 'active';
        console.log(`[selection-breeding] Created ${wasActivated ? 'ACTIVE' : 'candidate'} snapshot v${result.snapshot?.version_number} - gates: ${result.gate_results?.all_passed ? 'PASSED' : 'FAILED'}`);
        
        // Log the candidate/activation
        await supabase.from('control_events').insert({
          action: wasActivated ? 'auto_brain_activated' : 'auto_candidate_created',
          metadata: {
            triggered_by: 'selection_breeding',
            ended_generation_id,
            snapshot_version: result.snapshot?.version_number,
            gates_passed: result.gate_results?.all_passed,
            qualified_agents: result.gate_results?.agent_gates?.passed,
            auto_activated: wasActivated,
          },
        });
      } else {
        console.log(`[selection-breeding] Candidate creation skipped: ${result.error}`);
      }
    } catch (err) {
      console.error('[selection-breeding] Failed to create candidate snapshot:', err);
      // Non-fatal - rollover still succeeded
    }

    // 13. GUARDRAIL: Enforce max cohort size by pruning extras
    const TARGET_COHORT_SIZE = 100;
    const { count: currentCount } = await supabase
      .from('generation_agents')
      .select('*', { count: 'exact', head: true })
      .eq('generation_id', new_generation_id);

    if (currentCount && currentCount > TARGET_COHORT_SIZE) {
      const excessCount = currentCount - TARGET_COHORT_SIZE;
      console.log(`[selection-breeding] GUARDRAIL: Pruning ${excessCount} excess agents to enforce ${TARGET_COHORT_SIZE} cap`);

      // Get all agents in cohort with their fitness (simpler query)
      const { data: cohortMembers } = await supabase
        .from('generation_agents')
        .select('agent_id')
        .eq('generation_id', new_generation_id);

      if (cohortMembers && cohortMembers.length > TARGET_COHORT_SIZE) {
        const agentIds = cohortMembers.map(m => m.agent_id);
        
        // Get performance for these agents
        const { data: performances } = await supabase
          .from('performance')
          .select('agent_id, fitness_score')
          .eq('generation_id', new_generation_id)
          .in('agent_id', agentIds);

        const fitnessMap = new Map((performances ?? []).map(p => [p.agent_id, p.fitness_score ?? 0]));
        
        // Sort by fitness ascending (worst first) and take excess
        const sortedByFitness = agentIds
          .map(id => ({ id, fitness: fitnessMap.get(id) ?? 0 }))
          .sort((a, b) => a.fitness - b.fitness);
        
        const excessIds = sortedByFitness.slice(0, excessCount).map(a => a.id);

        // Remove from generation_agents
        await supabase
          .from('generation_agents')
          .delete()
          .in('agent_id', excessIds)
          .eq('generation_id', new_generation_id);

        console.log(`[selection-breeding] Pruned ${excessIds.length} excess agents`);
      }
    }

    // 14. Verify final agent count
    const { count: finalCount } = await supabase
      .from('generation_agents')
      .select('*', { count: 'exact', head: true })
      .eq('generation_id', new_generation_id);

    console.log(`[selection-breeding] Completed. New generation agent count: ${finalCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        ended_generation_id,
        new_generation_id,
        selection: {
          cohort_size: cohortSize,
          elites: elites.length,
          parents: parents.length,
          removed: removed.length,
        },
        breeding: {
          offspring_created: insertedOffspringIds.length,
        },
        new_generation_agent_count: finalCount,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[selection-breeding] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
