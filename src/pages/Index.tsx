import { useMemo } from 'react';
import { OrbitalCommandCenter } from '@/components/orbital';
import { OrbitalCard } from '@/contexts/OrbitalContext';
import { Header } from '@/components/layout/Header';
import { LiveLockedWorkspace } from '@/components/dashboard/LiveLockedWorkspace';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
import { useSystemState, useRealtimeSubscriptions } from '@/hooks/useEvoTraderData';
import { useBaselineInvariants } from '@/hooks/useBaselineInvariants';
import { usePerformanceAlerts } from '@/hooks/usePerformanceAlerts';
import { SystemStatus, Generation } from '@/types/evotrader';
import { Loader2 } from 'lucide-react';

// Cockpit tiles
import { TradeCycleTile, GenHealthTile, PollingHealthTile, SystemControlTile, CapitalOverviewTile, NewsTile, RolloverTile, GenComparisonTile } from '@/components/orbital/tiles/CockpitTiles';
// Drillable cards
import { PortfolioCardContent, PositionsCardContent, OrdersCardContent, TradesCardContent, AgentsCardContent, GenerationsCardContent, AlertsCardContent } from '@/components/orbital/tiles/DrillableCards';

// Static cards that don't depend on dynamic data
const staticCards: OrbitalCard[] = [
  // Cockpit tiles (not drillable)
  { id: 'trade-cycle', title: 'Trade Cycle', type: 'cockpit', component: TradeCycleTile },
  { id: 'polling', title: 'Polling Health', type: 'cockpit', component: PollingHealthTile },
  { id: 'control', title: 'System Control', type: 'cockpit', component: SystemControlTile },
  { id: 'capital', title: 'Capital Overview', type: 'cockpit', component: CapitalOverviewTile },
  { id: 'gen-compare', title: 'Gen 10 vs 11', type: 'cockpit', component: GenComparisonTile },
  { id: 'news', title: 'News Feed', type: 'cockpit', component: NewsTile },
  { id: 'rollover', title: 'Rollover Checklist', type: 'cockpit', component: RolloverTile },
  // Drillable cards - static paths
  { id: 'trades', title: 'Trades & Fills', type: 'drillable', drilldownPath: '/trades', component: TradesCardContent },
  { id: 'agents', title: 'Agent Leaderboard', type: 'drillable', drilldownPath: '/agents', component: AgentsCardContent },
  { id: 'portfolio', title: 'Portfolio & Positions', type: 'drillable', drilldownPath: '/portfolio', component: PortfolioCardContent },
  { id: 'positions', title: 'Positions', type: 'drillable', drilldownPath: '/positions', component: PositionsCardContent },
  { id: 'orders', title: 'Orders', type: 'drillable', drilldownPath: '/orders', component: OrdersCardContent },
  { id: 'generations', title: 'Generations', type: 'drillable', drilldownPath: '/generations', component: GenerationsCardContent },
  { id: 'alerts', title: 'Alerts', type: 'drillable', drilldownPath: '/alerts', component: AlertsCardContent },
];

const Index = () => {
  const { isLive, isLiveArmed } = useCurrentTradeMode();
  useRealtimeSubscriptions();
  useBaselineInvariants(); // Dev-only baseline guard
  usePerformanceAlerts(); // Performance alert evaluations
  const { data: systemState, isLoading } = useSystemState();
  
  const currentGeneration = systemState?.generations as Generation | null;
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  const currentGenId = systemState?.current_generation_id;

  // Build cards with dynamic genId path for GEN_010 Health
  const orbitalCards = useMemo<OrbitalCard[]>(() => {
    const genHealthPath = currentGenId 
      ? `/generations/${currentGenId}` 
      : '/generations';
    
    const genHealthCard: OrbitalCard = {
      id: 'gen-health',
      title: 'GEN_010 Health',
      type: 'drillable',
      drilldownPath: genHealthPath,
      component: GenHealthTile,
    };
    
    // Put gen-health first among drillables for visibility
    return [
      ...staticCards.slice(0, 4), // cockpit tiles
      genHealthCard,
      ...staticCards.slice(4), // other drillables
    ];
  }, [currentGenId]);

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
