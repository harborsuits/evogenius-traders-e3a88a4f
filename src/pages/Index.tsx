import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MarketTicker } from '@/components/dashboard/MarketTicker';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { GenerationProgress } from '@/components/dashboard/GenerationProgress';
import { AgentGrid } from '@/components/dashboard/AgentGrid';
import { TradeLog } from '@/components/dashboard/TradeLog';
import { GenerationHistory } from '@/components/dashboard/GenerationHistory';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { ConfigViewer } from '@/components/dashboard/ConfigViewer';
import { 
  mockSystemState, 
  mockMarketData, 
  mockAgents, 
  mockTrades,
  mockGenerationHistory,
  mockConfig 
} from '@/data/mockData';
import { 
  DollarSign, 
  Users, 
  Activity, 
  TrendingUp,
  Wallet,
  Shield
} from 'lucide-react';
import { SystemStatus } from '@/types/evotrader';

const Index = () => {
  const [status, setStatus] = useState<SystemStatus>(mockSystemState.status);

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Header 
        status={status} 
        generationNumber={mockSystemState.current_generation?.generation_number} 
      />
      
      <main className="container px-4 md:px-6 py-6 space-y-6">
        {/* Market Ticker */}
        <section className="animate-fade-in">
          <MarketTicker markets={mockMarketData} />
        </section>

        {/* Key Metrics */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <MetricCard
            label="Total Capital"
            value={`$${mockSystemState.total_capital.toLocaleString()}`}
            icon={Wallet}
            variant="stat"
          />
          <MetricCard
            label="Active Pool"
            value={`$${mockSystemState.active_pool.toLocaleString()}`}
            subValue={`${((mockSystemState.active_pool / mockSystemState.total_capital) * 100).toFixed(0)}%`}
            icon={DollarSign}
          />
          <MetricCard
            label="Reserve"
            value={`$${mockSystemState.reserve.toLocaleString()}`}
            icon={Shield}
          />
          <MetricCard
            label="Agents"
            value={mockSystemState.agents_count}
            subValue={`${mockSystemState.elite_count} elite`}
            icon={Users}
          />
          <MetricCard
            label="Today Trades"
            value={mockSystemState.today_trades}
            icon={Activity}
          />
          <MetricCard
            label="Today P&L"
            value={`$${mockSystemState.today_pnl.toFixed(2)}`}
            trend={mockSystemState.today_pnl >= 0 ? 'up' : 'down'}
            icon={TrendingUp}
          />
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Generation & Agents */}
          <div className="lg:col-span-8 space-y-6">
            {/* Generation Progress + Agent Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
              {mockSystemState.current_generation && (
                <GenerationProgress
                  generation={mockSystemState.current_generation}
                  maxTrades={mockConfig.generation.max_trades}
                  maxDays={mockConfig.generation.max_days}
                  maxDrawdown={mockConfig.generation.max_drawdown_pct}
                />
              )}
              <div className="bg-card border border-border rounded-lg p-6">
                <AgentGrid agents={mockAgents} />
              </div>
            </div>

            {/* Trade Log */}
            <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
              <TradeLog trades={mockTrades} maxHeight="350px" />
            </div>

            {/* Generation History */}
            <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
              <GenerationHistory generations={mockGenerationHistory} />
            </div>
          </div>

          {/* Right Column - Controls & Config */}
          <div className="lg:col-span-4 space-y-6">
            <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
              <ControlPanel 
                status={status}
                onStart={() => setStatus('running')}
                onPause={() => setStatus('paused')}
                onStop={() => setStatus('stopped')}
              />
            </div>
            
            <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
              <ConfigViewer config={mockConfig} />
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
