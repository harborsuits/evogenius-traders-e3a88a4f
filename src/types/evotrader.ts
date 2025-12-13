// EvoTrader Type Definitions

export type StrategyTemplate = 'trend_pullback' | 'mean_reversion' | 'breakout';

export type TradeOutcome = 'success' | 'failed' | 'denied';

export type TradeSide = 'BUY' | 'SELL';

export type GenerationTerminationReason = 'time' | 'trades' | 'drawdown';

export type AgentStatus = 'elite' | 'active' | 'probation' | 'removed';

export type SystemStatus = 'running' | 'paused' | 'stopped' | 'error';

// Gene definitions for each strategy
export interface TrendPullbackGenes {
  EMA_fast: number;
  EMA_slow: number;
  RSI_threshold: number;
  TP1: number;
  TP2: number;
  Trailing_stop: number;
}

export interface MeanReversionGenes {
  BB_period: number;
  BB_stddev: number;
  RSI_entry: number;
  TP: number;
  Stop_loss: number;
}

export interface BreakoutGenes {
  Lookback_period: number;
  Volatility_threshold: number;
  Volume_multiplier: number;
  TP: number;
  Trailing_stop: number;
}

export type AgentGenes = TrendPullbackGenes | MeanReversionGenes | BreakoutGenes;

// Database model types
export interface Agent {
  id: string;
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: AgentGenes;
  capital_allocation: number;
  is_elite: boolean;
  status: AgentStatus;
  created_at: string;
}

export interface Generation {
  id: string;
  generation_number: number;
  start_time: string;
  end_time: string | null;
  regime_tag: string | null;
  termination_reason: GenerationTerminationReason | null;
  avg_fitness: number | null;
  total_trades: number;
  total_pnl: number;
  max_drawdown: number;
  is_active: boolean;
}

export interface Trade {
  id: string;
  agent_id: string;
  generation_id: string;
  timestamp: string;
  symbol: string;
  side: TradeSide;
  intent_size: number;
  fill_price: number;
  fill_size: number;
  fees: number;
  outcome: TradeOutcome;
  pnl: number;
}

export interface Performance {
  id: string;
  agent_id: string;
  generation_id: string;
  fitness_score: number;
  net_pnl: number;
  sharpe_ratio: number;
  max_drawdown: number;
  profitable_days_ratio: number;
  total_trades: number;
}

// Dashboard state types
export interface SystemState {
  status: SystemStatus;
  current_generation: Generation | null;
  total_capital: number;
  active_pool: number;
  reserve: number;
  agents_count: number;
  elite_count: number;
  today_trades: number;
  today_pnl: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  ema_50_slope: number;
  atr_ratio: number;
  regime: string;
  updated_at: string;
}

// Configuration types
export interface TradingConfig {
  symbols: string[];
  decision_interval_minutes: number;
}

export interface CapitalConfig {
  total: number;
  active_pool_pct: number;
}

export interface PopulationConfig {
  size: number;
  elite_count: number;
  parent_count: number;
}

export interface GenerationConfig {
  max_days: number;
  max_trades: number;
  max_drawdown_pct: number;
}

export interface RiskConfig {
  max_trades_per_agent_per_day: number;
  max_trades_per_symbol_per_day: number;
}

export interface SystemConfig {
  trading: TradingConfig;
  capital: CapitalConfig;
  population: PopulationConfig;
  generation: GenerationConfig;
  risk: RiskConfig;
}
