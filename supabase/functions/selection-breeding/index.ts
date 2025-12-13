import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===========================================================================
// SELECTION & BREEDING (SIMPLE PERCENTILE)
// ===========================================================================
// Population: 100 agents
// - Top 10% (10 agents) → ELITES: unchanged, retain full capital, reproduce
// - Next 15% (15 agents) → PARENTS: selected for breeding, survive as-is
// - Bottom 75% (75 agents) → REMOVED: replaced by offspring
// 
// Offspring creation:
// - 75 offspring created from 25 parents (elites + parents)
// - Each offspring is a mutated clone of a randomly selected parent
// - Mutation: ±5-15% per gene, 10% chance of larger mutation (±20-30%)
// - All genes clamped to type-specific boundaries
// ===========================================================================

const POPULATION_SIZE = 100;
const ELITE_COUNT = 10;       // Top 10%
const PARENT_COUNT = 15;      // Next 15%
const OFFSPRING_COUNT = 75;   // Bottom 75% replaced

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
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: Record<string, number>;
  capital_allocation: number;
  is_elite: boolean;
  status: string;
  fitness_score: number;
}

// Mutate a single gene value
function mutateGene(
  value: number,
  min: number,
  max: number,
  largeMutation: boolean
): number {
  // Standard mutation: ±5-15%
  // Large mutation: ±20-30%
  const mutationRange = largeMutation 
    ? 0.20 + Math.random() * 0.10  // 20-30%
    : 0.05 + Math.random() * 0.10; // 5-15%
  
  const direction = Math.random() < 0.5 ? -1 : 1;
  const mutatedValue = value * (1 + direction * mutationRange);
  
  // Clamp to bounds
  return Math.max(min, Math.min(max, mutatedValue));
}

// Create a mutated offspring from a parent
function createOffspring(
  parent: AgentWithFitness,
  newGenerationId: string
): { strategy_template: string; genes: Record<string, number>; generation_id: string } {
  const bounds = GENE_BOUNDS[parent.strategy_template] as Record<string, { min: number; max: number }>;
  const newGenes: Record<string, number> = {};
  
  for (const [geneName, value] of Object.entries(parent.genes)) {
    const geneBounds = bounds[geneName];
    if (geneBounds) {
      // 10% chance of large mutation for exploration
      const largeMutation = Math.random() < 0.10;
      newGenes[geneName] = mutateGene(value, geneBounds.min, geneBounds.max, largeMutation);
    } else {
      // Unknown gene, keep as-is
      newGenes[geneName] = value;
    }
  }
  
  return {
    strategy_template: parent.strategy_template,
    genes: newGenes,
    generation_id: newGenerationId,
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

    // 1. Get all agents with their fitness scores from ended generation
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, generation_id, strategy_template, genes, capital_allocation, is_elite, status');

    if (agentsError || !agents) {
      throw new Error(`Failed to fetch agents: ${agentsError?.message}`);
    }

    // 2. Get fitness scores for all agents from ended generation
    const { data: performances, error: perfError } = await supabase
      .from('performance')
      .select('agent_id, fitness_score')
      .eq('generation_id', ended_generation_id);

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

    // 3. SELECTION: Rank by fitness score (descending)
    const rankedAgents = [...agentsWithFitness].sort(
      (a, b) => b.fitness_score - a.fitness_score
    );

    const elites = rankedAgents.slice(0, ELITE_COUNT);
    const parents = rankedAgents.slice(ELITE_COUNT, ELITE_COUNT + PARENT_COUNT);
    const removed = rankedAgents.slice(ELITE_COUNT + PARENT_COUNT);

    console.log(`[selection-breeding] Selection: ${elites.length} elites, ${parents.length} parents, ${removed.length} removed`);

    // 4. Update agent statuses for elites (mark is_elite = true)
    const eliteIds = elites.map(a => a.id);
    const parentIds = parents.map(a => a.id);
    const removedIds = removed.map(a => a.id);

    // Mark elites
    const { error: eliteError } = await supabase
      .from('agents')
      .update({ 
        is_elite: true, 
        status: 'elite',
        generation_id: new_generation_id,
      })
      .in('id', eliteIds);

    if (eliteError) {
      console.error('[selection-breeding] Failed to update elites:', eliteError);
    }

    // Mark parents (active, not elite)
    const { error: parentError } = await supabase
      .from('agents')
      .update({ 
        is_elite: false, 
        status: 'active',
        generation_id: new_generation_id,
      })
      .in('id', parentIds);

    if (parentError) {
      console.error('[selection-breeding] Failed to update parents:', parentError);
    }

    // 5. BREEDING: Create offspring to replace removed agents
    const breedingPool = [...elites, ...parents]; // 25 parents total
    const offspring: { strategy_template: string; genes: Record<string, number>; generation_id: string }[] = [];

    for (let i = 0; i < OFFSPRING_COUNT; i++) {
      const parent = selectParent(breedingPool);
      const child = createOffspring(parent, new_generation_id);
      offspring.push(child);
    }

    console.log(`[selection-breeding] Created ${offspring.length} offspring`);

    // 6. Delete removed agents
    const { error: deleteError } = await supabase
      .from('agents')
      .delete()
      .in('id', removedIds);

    if (deleteError) {
      console.error('[selection-breeding] Failed to delete removed agents:', deleteError);
    }

    // 7. Insert offspring as new agents
    const offspringRecords = offspring.map(o => ({
      generation_id: o.generation_id,
      strategy_template: o.strategy_template,
      genes: o.genes,
      capital_allocation: 40, // Default allocation
      is_elite: false,
      status: 'active',
    }));

    const { data: insertedOffspring, error: insertError } = await supabase
      .from('agents')
      .insert(offspringRecords)
      .select('id');

    if (insertError) {
      console.error('[selection-breeding] Failed to insert offspring:', insertError);
    }

    // 8. Log selection/breeding event
    await supabase.from('control_events').insert({
      action: 'selection_breeding',
      metadata: {
        ended_generation_id,
        new_generation_id,
        elites_count: elites.length,
        parents_count: parents.length,
        removed_count: removed.length,
        offspring_created: insertedOffspring?.length ?? 0,
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

    // 9. Verify final agent count
    const { count: finalCount } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('generation_id', new_generation_id);

    console.log(`[selection-breeding] Completed. Final agent count: ${finalCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        ended_generation_id,
        new_generation_id,
        selection: {
          elites: elites.length,
          parents: parents.length,
          removed: removed.length,
        },
        breeding: {
          offspring_created: insertedOffspring?.length ?? 0,
        },
        final_agent_count: finalCount,
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
