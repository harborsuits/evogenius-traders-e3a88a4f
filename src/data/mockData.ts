import { 
  Agent, 
  Generation, 
  Trade, 
  Performance, 
  SystemState, 
  MarketData,
  SystemConfig,
  TrendPullbackGenes,
  MeanReversionGenes,
  BreakoutGenes,
  StrategyTemplate,
  TradeSide,
  TradeOutcome,
  GenerationTerminationReason
} from '@/types/evotrader';

// Mock current generation
export const mockCurrentGeneration: Generation = {
  id: 'gen-007',
  generation_number: 7,
  start_time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  end_time: null,
  regime_tag: 'Trending + High Vol',
  termination_reason: null,
  avg_fitness: null,
  total_trades: 67,
  total_pnl: 234.56,
  max_drawdown: 8.3,
  is_active: true,
};

// Mock system state
export const mockSystemState: SystemState = {
  status: 'running',
  current_generation: mockCurrentGeneration,
  total_capital: 10000,
  active_pool: 4000,
  reserve: 6000,
  agents_count: 100,
  elite_count: 10,
  today_trades: 12,
  today_pnl: 45.23,
};

// Mock market data
export const mockMarketData: MarketData[] = [
  {
    symbol: 'BTC-USD',
    price: 43250.00,
    change_24h: 2.34,
    volume_24h: 28500000000,
    ema_50_slope: 0.028,
    atr_ratio: 1.65,
    regime: 'Trending',
  },
  {
    symbol: 'ETH-USD',
    price: 2280.50,
    change_24h: -0.87,
    volume_24h: 15200000000,
    ema_50_slope: -0.005,
    atr_ratio: 1.42,
    regime: 'Ranging',
  },
];

// Generate mock agents
const strategyDistribution: { template: StrategyTemplate; count: number }[] = [
  { template: 'trend_pullback', count: 33 },
  { template: 'mean_reversion', count: 33 },
  { template: 'breakout', count: 34 },
];

const generateMockGenes = (strategy: StrategyTemplate): TrendPullbackGenes | MeanReversionGenes | BreakoutGenes => {
  switch (strategy) {
    case 'trend_pullback':
      return {
        EMA_fast: Math.floor(Math.random() * 20) + 10,
        EMA_slow: Math.floor(Math.random() * 200) + 100,
        RSI_threshold: Math.floor(Math.random() * 20) + 25,
        TP1: Number((Math.random() * 1.5 + 1.5).toFixed(2)),
        TP2: Number((Math.random() * 3 + 3).toFixed(2)),
        Trailing_stop: Number((Math.random() * 1.5 + 0.5).toFixed(2)),
      } as TrendPullbackGenes;
    case 'mean_reversion':
      return {
        BB_period: Math.floor(Math.random() * 16) + 14,
        BB_stddev: Number((Math.random() * 1.5 + 1.5).toFixed(2)),
        RSI_entry: Math.floor(Math.random() * 20) + 20,
        TP: Number((Math.random() * 2 + 1).toFixed(2)),
        Stop_loss: Number((Math.random() * 1.5 + 0.5).toFixed(2)),
      } as MeanReversionGenes;
    case 'breakout':
      return {
        Lookback_period: Math.floor(Math.random() * 30) + 10,
        Volatility_threshold: Number((Math.random() + 0.5).toFixed(2)),
        Volume_multiplier: Number((Math.random() * 1.5 + 1.5).toFixed(2)),
        TP: Number((Math.random() * 4 + 2).toFixed(2)),
        Trailing_stop: Number((Math.random() * 2 + 1).toFixed(2)),
      } as BreakoutGenes;
  }
};

export const mockAgents: Agent[] = [];
let agentIndex = 0;

strategyDistribution.forEach(({ template, count }) => {
  for (let i = 0; i < count; i++) {
    const isElite = agentIndex < 10;
    const isProbation = agentIndex >= 85;
    
    mockAgents.push({
      id: `agent-${String(agentIndex + 1).padStart(3, '0')}`,
      generation_id: 'gen-007',
      strategy_template: template,
      genes: generateMockGenes(template),
      capital_allocation: isElite ? 40 : (isProbation ? 20 : 40),
      is_elite: isElite,
      status: isElite ? 'elite' : (isProbation ? 'probation' : 'active'),
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    agentIndex++;
  }
});

// Mock trades
const tradeSides: TradeSide[] = ['BUY', 'SELL'];
const tradeOutcomes: TradeOutcome[] = ['success', 'failed', 'denied'];

export const mockTrades: Trade[] = Array.from({ length: 50 }, (_, i) => {
  const symbol = Math.random() > 0.5 ? 'BTC-USD' : 'ETH-USD';
  const outcomeRandom = Math.random();
  const outcome: TradeOutcome = outcomeRandom > 0.1 ? 'success' : (outcomeRandom > 0.05 ? 'failed' : 'denied');
  
  return {
    id: `trade-${String(i + 1).padStart(4, '0')}`,
    agent_id: `agent-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
    generation_id: 'gen-007',
    timestamp: new Date(Date.now() - Math.random() * 4 * 24 * 60 * 60 * 1000).toISOString(),
    symbol,
    side: tradeSides[Math.floor(Math.random() * 2)],
    intent_size: Number((Math.random() * 0.01).toFixed(6)),
    fill_price: symbol === 'BTC-USD' ? 43250 + Math.random() * 500 : 2280 + Math.random() * 50,
    fill_size: Number((Math.random() * 0.01).toFixed(6)),
    fees: Number((Math.random() * 0.5).toFixed(2)),
    outcome,
    pnl: Number((Math.random() * 20 - 5).toFixed(2)),
  };
}).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

// Mock generation history
const terminationReasons: GenerationTerminationReason[] = ['time', 'trades', 'drawdown'];
const regimeTags = ['Trending', 'Ranging + Low Vol', 'High Vol', 'Trending + High Vol', 'Ranging', 'Trending'];

export const mockGenerationHistory: Generation[] = Array.from({ length: 6 }, (_, i) => ({
  id: `gen-${String(i + 1).padStart(3, '0')}`,
  generation_number: i + 1,
  start_time: new Date(Date.now() - (7 - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
  end_time: new Date(Date.now() - (6 - i) * 7 * 24 * 60 * 60 * 1000).toISOString(),
  regime_tag: regimeTags[i],
  termination_reason: terminationReasons[i % 3],
  avg_fitness: Number((Math.random() * 0.5 + 0.3).toFixed(3)),
  total_trades: Math.floor(Math.random() * 50) + 50,
  total_pnl: Number((Math.random() * 400 - 100).toFixed(2)),
  max_drawdown: Number((Math.random() * 10 + 3).toFixed(1)),
  is_active: false,
}));

// Mock performance data
export const mockPerformance: Performance[] = mockAgents.slice(0, 25).map((agent, i) => ({
  id: `perf-${i + 1}`,
  agent_id: agent.id,
  generation_id: 'gen-007',
  fitness_score: Number((Math.random() * 0.8 + 0.2).toFixed(3)),
  net_pnl: Number((Math.random() * 100 - 20).toFixed(2)),
  sharpe_ratio: Number((Math.random() * 3 - 0.5).toFixed(2)),
  max_drawdown: Number((Math.random() * 15).toFixed(1)),
  profitable_days_ratio: Number((Math.random() * 0.4 + 0.4).toFixed(2)),
  total_trades: Math.floor(Math.random() * 20) + 5,
}));

// Mock config
export const mockConfig: SystemConfig = {
  trading: {
    symbols: ['BTC-USD', 'ETH-USD'],
    decision_interval_minutes: 60,
  },
  capital: {
    total: 10000,
    active_pool_pct: 0.40,
  },
  population: {
    size: 100,
    elite_count: 10,
    parent_count: 15,
  },
  generation: {
    max_days: 7,
    max_trades: 100,
    max_drawdown_pct: 0.15,
  },
  risk: {
    max_trades_per_agent_per_day: 5,
    max_trades_per_symbol_per_day: 50,
  },
};
