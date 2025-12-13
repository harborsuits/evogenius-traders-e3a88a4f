import { Header } from '@/components/layout/Header';
import { MarketTicker } from '@/components/dashboard/MarketTicker';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { GenerationProgress } from '@/components/dashboard/GenerationProgress';
import { AgentGrid } from '@/components/dashboard/AgentGrid';
import { TradeLog } from '@/components/dashboard/TradeLog';
import { GenerationHistory } from '@/components/dashboard/GenerationHistory';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { ConfigViewer } from '@/components/dashboard/ConfigViewer';
import { ControlEventsLog } from '@/components/dashboard/ControlEventsLog';
import { PollingHealth } from '@/components/dashboard/PollingHealth';
import { CoinbasePanel } from '@/components/dashboard/CoinbasePanel';
import { 
  useSystemState,
  useAgents,
  useTrades,
  useMarketData,
  useGenerationHistory,
  useSystemConfig,
  useRealtimeSubscriptions,
} from '@/hooks/useEvoTraderData';
import { 
  DollarSign, 
  Users, 
  Activity, 
  TrendingUp,
  Wallet,
  Shield,
  Loader2
} from 'lucide-react';
import { Generation, Agent, SystemStatus } from '@/types/evotrader';

const Index = () => {
  // Enable real-time subscriptions
  useRealtimeSubscriptions();

  // Fetch all data from database
  const { data: systemState, isLoading: loadingState } = useSystemState();
  const { data: agents = [], isLoading: loadingAgents } = useAgents(systemState?.current_generation_id ?? null);
  const { data: trades = [], isLoading: loadingTrades } = useTrades(systemState?.current_generation_id ?? null);
  const { data: marketData = [], isLoading: loadingMarket } = useMarketData();
  const { data: generationHistory = [] } = useGenerationHistory();
  const { data: config } = useSystemConfig();

  const isLoading = loadingState || loadingAgents || loadingTrades || loadingMarket;

  // Extract current generation from system state
  const currentGeneration = systemState?.generations as Generation | null;
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  const eliteCount = agents.filter((a: Agent) => a.is_elite).length;

  // Default config values - always use this structure
  const defaultConfig = {
    trading: { symbols: ['BTC-USD', 'ETH-USD'], decision_interval_minutes: 60 },
    capital: { total: 10000, active_pool_pct: 0.40 },
    population: { size: 100, elite_count: 10, parent_count: 15 },
    generation: { max_days: 7, max_trades: 100, max_drawdown_pct: 0.15 },
    risk: { max_trades_per_agent_per_day: 5, max_trades_per_symbol_per_day: 50 },
  };

  // Merge with defaults to ensure all properties exist
  const activeConfig = {
    ...defaultConfig,
    ...config,
    generation: { ...defaultConfig.generation, ...(config?.generation ?? {}) },
    trading: { ...defaultConfig.trading, ...(config?.trading ?? {}) },
    capital: { ...defaultConfig.capital, ...(config?.capital ?? {}) },
    population: { ...defaultConfig.population, ...(config?.population ?? {}) },
    risk: { ...defaultConfig.risk, ...(config?.risk ?? {}) },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="font-mono">Loading EvoTrader...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Header 
        status={status} 
        generationNumber={currentGeneration?.generation_number} 
      />
      
      <main className="container px-4 md:px-6 py-6 space-y-6">
        {/* Market Ticker */}
        <section className="animate-fade-in">
          <MarketTicker markets={marketData} />
        </section>

        {/* Key Metrics */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <MetricCard
            label="Total Capital"
            value={`$${(systemState?.total_capital ?? 0).toLocaleString()}`}
            icon={Wallet}
            variant="stat"
          />
          <MetricCard
            label="Active Pool"
            value={`$${(systemState?.active_pool ?? 0).toLocaleString()}`}
            subValue={systemState?.total_capital ? `${((systemState.active_pool / systemState.total_capital) * 100).toFixed(0)}%` : '0%'}
            icon={DollarSign}
          />
          <MetricCard
            label="Reserve"
            value={`$${(systemState?.reserve ?? 0).toLocaleString()}`}
            icon={Shield}
          />
          <MetricCard
            label="Agents"
            value={agents.length}
            subValue={`${eliteCount} elite`}
            icon={Users}
          />
          <MetricCard
            label="Today Trades"
            value={systemState?.today_trades ?? 0}
            icon={Activity}
          />
          <MetricCard
            label="Today P&L"
            value={`$${(systemState?.today_pnl ?? 0).toFixed(2)}`}
            trend={(systemState?.today_pnl ?? 0) >= 0 ? 'up' : 'down'}
            icon={TrendingUp}
          />
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Generation & Agents */}
          <div className="lg:col-span-8 space-y-6">
            {/* Generation Progress + Agent Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
              {currentGeneration && (
                <GenerationProgress
                  generation={currentGeneration}
                  maxTrades={activeConfig.generation.max_trades}
                  maxDays={activeConfig.generation.max_days}
                  maxDrawdown={activeConfig.generation.max_drawdown_pct}
                />
              )}
              <div className="bg-card border border-border rounded-lg p-6">
                <AgentGrid agents={agents} />
              </div>
            </div>

            {/* Trade Log */}
            <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
              <TradeLog trades={trades} maxHeight="350px" />
            </div>

            {/* Generation History */}
            <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
              <GenerationHistory generations={generationHistory} />
            </div>
          </div>

          {/* Right Column - Controls & Config */}
          <div className="lg:col-span-4 space-y-6">
            <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
              <ControlPanel 
                status={status}
                onStart={() => console.log('Start')}
                onPause={() => console.log('Pause')}
                onStop={() => console.log('Stop')}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '250ms' }}>
              <ControlEventsLog />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '275ms' }}>
              <PollingHealth />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
              <CoinbasePanel />
            </div>
            
            <div className="animate-fade-in" style={{ animationDelay: '350ms' }}>
              <ConfigViewer config={activeConfig} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-8 text-center">
          <p className="text-xs text-muted-foreground font-mono">
            EvoTrader v1.0 • Evolutionary Crypto Trading System • Coinbase Advanced Trade API
          </p>
          <p className="text-xs text-muted-foreground/50 font-mono mt-1">
            Risk Warning: Trading cryptocurrencies involves significant risk. Start small. Validate thoroughly.
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
