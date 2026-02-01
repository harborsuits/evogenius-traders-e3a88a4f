
# EvoTrader Profit Maximization Plan v2.0

## Executive Summary

**Goal:** Maximize profit by routing strategies to winning regimes, rebalancing population toward proven edges, and fixing evolutionary dead ends.

**Key Findings from System Audit:**
- **628 agents** total: 303 trend_pullback, 306 breakout, 19 mean_reversion
- **Mean reversion wins 68.8%** in range markets (+3.15% avg PnL)
- **Trend pullback loses -4.47%** when misrouted to range markets
- **Breakout loses everywhere** (26-30% win rate, -5.71% avg)
- **Performance table has 0 non-zero PnL** despite 591 records - fitness evolution is broken
- **Shadow trades dominate** (30,016 calculated) vs paper trades (0 realized PnL in positions)
- **75 symbols active** but LTC, SUI, UNI are consistently unprofitable

---

## Phase 0: Safety Infrastructure (Database Changes)

### 0A. Add Agent Disable Flag (Non-Destructive)

```sql
-- Add soft-disable capability to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS disabled_reason TEXT,
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active) WHERE is_active = true;
```

### 0B. Add System Config Keys for Strategy/Symbol Control

```sql
-- Update system_config with strategy and symbol blacklist
UPDATE system_config
SET config = jsonb_set(
  jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{strategy_enabled}',
    '{"mean_reversion": true, "trend_pullback": true, "breakout": false}'::jsonb
  ),
  '{symbol_blacklist}',
  '["LTC-USD", "SUI-USD", "UNI-USD"]'::jsonb
)
WHERE id = (SELECT id FROM system_config LIMIT 1);
```

---

## Phase 1: Stop The Bleeding (Immediate - Database Only)

### 1A. Disable Breakout Strategy Agents

```sql
-- Soft-disable all 306 breakout agents (recoverable)
UPDATE agents
SET is_active = false,
    disabled_reason = 'Strategy loses in all regimes (26-30% WR, -5.71% avg PnL)',
    disabled_at = NOW()
WHERE strategy_template = 'breakout';
```

**Expected Result:** 306 agents disabled, only trend_pullback (303) + mean_reversion (19) = 322 active

### 1B. Update Preferred Regimes for Existing Agents

The system already has regime gating infrastructure at lines 2365-2396 in trade-cycle. But most agents have `preferred_regime = 'any'`:
- 263 trend_pullback agents have `any` (should be `trend`)  
- 253 breakout agents have `any` (will be disabled anyway)
- 3 mean_reversion agents have `any` (should be `range`)

```sql
-- Fix trend_pullback agents: should only trade in TREND regimes
UPDATE agents
SET preferred_regime = 'trend'
WHERE strategy_template = 'trend_pullback'
  AND (preferred_regime IS NULL OR preferred_regime = 'any');

-- Fix mean_reversion agents: should only trade in RANGE regimes  
UPDATE agents
SET preferred_regime = 'range'
WHERE strategy_template = 'mean_reversion'
  AND (preferred_regime IS NULL OR preferred_regime = 'any');
```

---

## Phase 2: Enforce Strategy/Symbol Gating in trade-cycle

### File: `supabase/functions/trade-cycle/index.ts`

The regime gating already exists (lines 2365-2396) and works correctly. We need to add:

1. **Strategy Enable/Disable Check** - Read from `system_config.strategy_enabled`
2. **Symbol Blacklist Check** - Read from `system_config.symbol_blacklist`
3. **is_active Filter** - Only query active agents

### Changes Required:

**Near line 2050 (agent query):**
```typescript
// Current:
const { data: agents } = await supabase
  .from('agents')
  .select('*')
  .eq('status', 'active')
  .limit(100);

// Change to:
const { data: agents } = await supabase
  .from('agents')
  .select('*')
  .eq('status', 'active')
  .eq('is_active', true)  // NEW: respect soft-disable
  .limit(100);
```

**Near line 2260 (config loading), add:**
```typescript
// Load strategy enable/disable config
const strategyEnabled = (systemConfig.strategy_enabled ?? {
  mean_reversion: true,
  trend_pullback: true,
  breakout: false,
}) as Record<string, boolean>;

// Load symbol blacklist
const symbolBlacklist = (systemConfig.symbol_blacklist ?? []) as string[];
```

**Near line 2346 (symbol evaluation loop), add blacklist check:**
```typescript
for (const sym of symbolsToEvaluate) {
  // NEW: Skip blacklisted symbols
  if (symbolBlacklist.includes(sym)) {
    console.log(`[trade-cycle] ${sym}: BLACKLISTED, skipping`);
    continue;
  }
  
  const mkt = marketBySymbol.get(sym);
  // ... rest of loop
}
```

**At start of agent evaluation, add strategy check:**
```typescript
// NEW: Skip if agent's strategy is disabled
if (!strategyEnabled[agent.strategy_template]) {
  console.log(`[trade-cycle] Agent ${agent.id}: Strategy ${agent.strategy_template} DISABLED`);
  return new Response(
    JSON.stringify({ ok: true, decision: 'hold', reason: 'strategy_disabled' }),
    { status: 200, headers: corsHeaders }
  );
}
```

---

## Phase 3: Population Rebalancing (Mean Reversion Expansion)

### Current State:
- 19 mean_reversion agents (3% of population)
- 303 trend_pullback agents (48%)
- 306 breakout agents (49% - being disabled)

### Target State:
- 200+ mean_reversion agents (35-40%)
- 200+ trend_pullback agents (35-40%)
- 0 breakout agents (disabled)

### Implementation: Clone Top Mean Reversion Agents with Mutation

```sql
-- Step 1: Create gene mutation function
CREATE OR REPLACE FUNCTION mutate_genes(base_genes JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := base_genes;
  key TEXT;
  val NUMERIC;
  mutation_factor NUMERIC;
BEGIN
  FOR key IN SELECT jsonb_object_keys(base_genes) LOOP
    val := (base_genes->>key)::NUMERIC;
    -- ±5% random mutation per gene
    mutation_factor := 0.95 + (RANDOM() * 0.10);
    result := jsonb_set(result, ARRAY[key], to_jsonb(ROUND((val * mutation_factor)::numeric, 4)));
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

```sql
-- Step 2: Clone each mean_reversion agent ~10x with mutations
INSERT INTO agents (generation_id, strategy_template, genes, capital_allocation, is_elite, status, role, preferred_regime, is_active)
SELECT 
  a.generation_id,
  'mean_reversion',
  mutate_genes(a.genes),
  40,  -- Standard capital allocation
  false,
  'active'::agent_status,
  'core'::agent_role,
  'range',  -- Mean reversion should only trade in range regimes
  true
FROM agents a
CROSS JOIN generate_series(1, 10) as multiplier
WHERE a.strategy_template = 'mean_reversion'
  AND a.status = 'active';
```

This creates ~190 new mean_reversion agents (19 base × 10 clones), bringing total to ~209.

---

## Phase 4: Fix Fitness Data Pipeline

### Problem Identified:
The performance table has 591 records but **0 non-zero PnL values**. This means:
- Fitness calculation runs but doesn't read real PnL
- Evolution has no signal to optimize against
- Elite selection is essentially random

### Root Cause (from fitness-calc analysis):
Looking at `calculateRealizedPnL()` function (lines 240-335):
- It calculates PnL correctly from paper_orders/paper_fills
- But paper_positions.realized_pnl is all NULL/zero
- Shadow trades have real data (30K trades, -17.26 total PnL)

### Fix in `supabase/functions/fitness-calc/index.ts`:

The fitness function already handles shadow-only data correctly (lines 437-491 `blendFitnessScores`), but it's likely failing to find paper trades.

**Add logging to diagnose:**
```typescript
// Near line 580 (in main fitness calculation loop)
console.log(`[fitness-calc] Agent ${agent.id}: paper_trades=${paperTrades.length}, shadow_trades=${shadowTrades.length}`);
```

**Verify paper_orders join is working:**
```typescript
// Ensure we're querying the right paper account
const { data: orders } = await supabase
  .from('paper_orders')
  .select('*')
  .eq('agent_id', agentId)
  .eq('status', 'filled')
  .gte('created_at', generationStartTime);

console.log(`[fitness-calc] Agent ${agentId} orders query returned: ${orders?.length ?? 0}`);
```

---

## Phase 5: Update Type Definitions

### File: `src/hooks/useSystemConfig.ts`

Add the new config keys to the TypeScript interface:

```typescript
export interface SystemConfig {
  // ... existing fields ...
  
  // NEW: Strategy enable/disable
  strategy_enabled?: {
    mean_reversion?: boolean;
    trend_pullback?: boolean;
    breakout?: boolean;
    bollinger_range?: boolean;
  };
  
  // NEW: Symbol blacklist
  symbol_blacklist?: string[];
}
```

### File: `src/types/evotrader.ts`

Update Agent interface:

```typescript
export interface Agent {
  id: string;
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: AgentGenes;
  capital_allocation: number;
  is_elite: boolean;
  status: AgentStatus;
  created_at: string;
  role?: 'core' | 'explorer';
  preferred_regime?: 'trend' | 'range' | 'dead' | 'any';
  // NEW: Soft disable fields
  is_active?: boolean;
  disabled_reason?: string;
  disabled_at?: string;
}
```

---

## Implementation Order

### Day 1: Stop Bleeding (Database Only)
1. Execute Phase 0 SQL (add is_active column, strategy_enabled config)
2. Execute Phase 1A SQL (disable breakout agents)
3. Execute Phase 1B SQL (fix preferred_regime for existing agents)

### Day 2: Code Deploy
4. Update trade-cycle to check is_active, strategy_enabled, symbol_blacklist
5. Update TypeScript types
6. Deploy edge functions

### Day 3: Population Rebalance
7. Create mutate_genes function
8. Clone mean_reversion agents (~190 new)
9. Register new agents in generation_agents table

### Day 4-7: Monitor & Tune
10. Watch logs for regime routing effectiveness
11. Monitor shadow trade win rates by strategy
12. Verify fitness calculation is writing non-zero PnL

---

## Expected Outcomes

### After Day 1 (Breakout Disabled):
- 50% fewer losing trades (306 breakout agents stopped)
- Regime-gated agents only trade in matching conditions

### After Day 3 (Population Rebalanced):
- 35-40% mean_reversion agents (proven 68% win rate in range)
- 35-40% trend_pullback agents (60% win rate in trend)
- More trades per day (larger winning strategy populations)

### After Day 7 (System Stabilized):
- Win rate target: 60%+ (currently ~45%)
- Avg PnL target: +1.5% per trade (currently negative)
- Fitness scores reflect real profitability

---

## Monitoring Queries

### Daily Performance Check:
```sql
SELECT 
  DATE(created_at) as trade_date,
  COUNT(*) as trades,
  ROUND(AVG(simulated_pnl_pct)::numeric, 4) as avg_pnl_pct,
  COUNT(CASE WHEN simulated_pnl > 0 THEN 1 END)::float / COUNT(*) * 100 as win_rate
FROM shadow_trades
WHERE outcome_status = 'calculated'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY trade_date DESC;
```

### Strategy Performance:
```sql
SELECT 
  a.strategy_template,
  a.preferred_regime,
  COUNT(st.id) as trades,
  ROUND(AVG(st.simulated_pnl_pct)::numeric, 4) as avg_pnl,
  COUNT(CASE WHEN st.simulated_pnl > 0 THEN 1 END)::float / COUNT(*) * 100 as win_rate
FROM shadow_trades st
JOIN agents a ON st.agent_id = a.id
WHERE st.outcome_status = 'calculated'
  AND st.created_at > NOW() - INTERVAL '7 days'
GROUP BY a.strategy_template, a.preferred_regime
ORDER BY avg_pnl DESC;
```

---

## Rollback Plan

If performance degrades after changes:

```sql
-- Re-enable breakout agents
UPDATE agents
SET is_active = true,
    disabled_reason = NULL,
    disabled_at = NULL
WHERE strategy_template = 'breakout';

-- Reset preferred_regime to any
UPDATE agents
SET preferred_regime = 'any'
WHERE preferred_regime IN ('trend', 'range');

-- Reset system_config
UPDATE system_config
SET config = config - 'strategy_enabled' - 'symbol_blacklist'
WHERE id = (SELECT id FROM system_config LIMIT 1);
```

All changes are soft/reversible. No data is deleted.
