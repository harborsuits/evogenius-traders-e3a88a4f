import { OrbitalCommandCenter } from '@/components/orbital';
import { OrbitalCard } from '@/contexts/OrbitalContext';
import { Header } from '@/components/layout/Header';
import { LiveLockedWorkspace } from '@/components/dashboard/LiveLockedWorkspace';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
import { useSystemState, useRealtimeSubscriptions } from '@/hooks/useEvoTraderData';
import { SystemStatus, Generation } from '@/types/evotrader';
import { Loader2 } from 'lucide-react';

// Cockpit tiles
import { TradeCycleTile, GenHealthTile, PollingHealthTile, SystemControlTile, CapitalOverviewTile } from '@/components/orbital/tiles/CockpitTiles';
// Drillable cards
import { PortfolioCardContent, PositionsCardContent, OrdersCardContent, TradesCardContent, AgentsCardContent, GenerationsCardContent } from '@/components/orbital/tiles/DrillableCards';

// Define all orbital cards
const orbitalCards: OrbitalCard[] = [
  // Cockpit tiles (not drillable)
  { id: 'trade-cycle', title: 'Trade Cycle', type: 'cockpit', component: TradeCycleTile },
  { id: 'polling', title: 'Polling Health', type: 'cockpit', component: PollingHealthTile },
  { id: 'control', title: 'System Control', type: 'cockpit', component: SystemControlTile },
  { id: 'capital', title: 'Capital Overview', type: 'cockpit', component: CapitalOverviewTile },
  // Drillable cards - these navigate to full pages
  { id: 'gen-health', title: 'GEN_010 Health', type: 'drillable', drilldownPath: '/generations', component: GenHealthTile },
  { id: 'trades', title: 'Trades & Fills', type: 'drillable', drilldownPath: '/fills', component: TradesCardContent },
  { id: 'agents', title: 'Agent Leaderboard', type: 'drillable', drilldownPath: '/agents', component: AgentsCardContent },
  { id: 'portfolio', title: 'Portfolio & Positions', type: 'drillable', drilldownPath: '/portfolio', component: PortfolioCardContent },
  { id: 'positions', title: 'Positions', type: 'drillable', drilldownPath: '/positions', component: PositionsCardContent },
  { id: 'orders', title: 'Orders', type: 'drillable', drilldownPath: '/orders', component: OrdersCardContent },
  { id: 'generations', title: 'Generations', type: 'drillable', drilldownPath: '/generations', component: GenerationsCardContent },
];

const Index = () => {
  const { isLive, isLiveArmed } = useCurrentTradeMode();
  useRealtimeSubscriptions();
  const { data: systemState, isLoading } = useSystemState();
  
  const currentGeneration = systemState?.generations as Generation | null;
  const status = (systemState?.status ?? 'stopped') as SystemStatus;

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

  if (isLive && !isLiveArmed) {
    return (
      <div className="min-h-screen bg-background bg-grid">
        <Header status={status} generationNumber={currentGeneration?.generation_number} />
        <main className="container px-4 md:px-6 py-6 max-w-3xl mx-auto">
          <LiveLockedWorkspace />
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header status={status} generationNumber={currentGeneration?.generation_number} />
      <div className="flex-1 overflow-hidden">
        <OrbitalCommandCenter cards={orbitalCards} />
      </div>
    </div>
  );
};

export default Index;
