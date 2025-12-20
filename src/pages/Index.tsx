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

// Consolidated hero tiles
import { DecisionStateTile } from '@/components/dashboard/DecisionStateTile';
import { MarketConditionsTile } from '@/components/dashboard/MarketConditionsTile';
import { SystemAuditDrawer } from '@/components/dashboard/SystemAuditDrawer';

// Cockpit tiles
import { 
  TradeCycleTile, 
  GenHealthTile, 
  PollingHealthTile, 
  SystemControlTile, 
  CapitalOverviewTile, 
  RolloverTile, 
  GenComparisonTile, 
  LineageTile, 
  AgentInactivityTile, 
  SymbolCoverageTile,
  CatalystWatchTile,
  AutopsyTile,
} from '@/components/orbital/tiles/CockpitTiles';
// Drillable cards
import { PositionsCardContent, ActivityCardContent, AgentsCardContent, GenerationsCardContent, AlertsCardContent } from '@/components/orbital/tiles/DrillableCards';

// Consolidated layout: ~10 cards reduced to focused hierarchy
// Row 1 (Hero): Decision State + Capital
// Row 2 (Context): Market Conditions + Agents
// Row 3 (Drillable): Activity, Positions, etc.
// Row 4 (Advanced): System Audit (collapsible)
const staticCards: OrbitalCard[] = [
  // ROW 1: Primary status (always visible, high signal)
  { id: 'decision-state', title: 'Decision State', type: 'cockpit', component: DecisionStateTile },
  { id: 'capital', title: 'Capital Overview', type: 'cockpit', component: CapitalOverviewTile },
  
  // ROW 2: Context cards
  { id: 'market-conditions', title: 'Market Conditions', type: 'cockpit', component: MarketConditionsTile },
  { id: 'agent-activity', title: 'Agent Activity', type: 'cockpit', component: AgentInactivityTile },
  
  // ROW 3: Operational tiles
  { id: 'trade-cycle', title: 'Trade Cycle', type: 'cockpit', component: TradeCycleTile },
  { id: 'control', title: 'System Control', type: 'cockpit', component: SystemControlTile },
  { id: 'polling', title: 'Polling Health', type: 'cockpit', component: PollingHealthTile },
  
  // ROW 4: Discovery tiles
  { id: 'symbol-coverage', title: 'Symbol Coverage', type: 'cockpit', component: SymbolCoverageTile },
  { id: 'catalyst-watch', title: 'Catalyst Watch', type: 'cockpit', component: CatalystWatchTile },
  { id: 'autopsy', title: 'Performance Autopsy', type: 'cockpit', component: AutopsyTile },
  
  // ROW 5: Advanced (audit drawer)
  { id: 'system-audit', title: 'System Audit', type: 'cockpit', component: SystemAuditDrawer },
  
  // Evolution comparison (contextual)
  { id: 'gen-compare', title: 'Gen 10 vs 11', type: 'cockpit', component: GenComparisonTile },
  { id: 'lineage', title: 'Lineage', type: 'cockpit', component: LineageTile },
  { id: 'rollover', title: 'Rollover Checklist', type: 'cockpit', component: RolloverTile },
  
  // Drillable cards (deep dive)
  { id: 'activity', title: 'Activity', type: 'drillable', drilldownPath: '/trades', component: ActivityCardContent },
  { id: 'agents', title: 'Agent Leaderboard', type: 'drillable', drilldownPath: '/agents', component: AgentsCardContent },
  { id: 'positions', title: 'Positions', type: 'drillable', drilldownPath: '/positions', component: PositionsCardContent },
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

  // Build cards with dynamic genId path for GEN Health
  const orbitalCards = useMemo<OrbitalCard[]>(() => {
    const genHealthPath = currentGenId 
      ? `/generations/${currentGenId}` 
      : '/generations';
    
    const genHealthCard: OrbitalCard = {
      id: 'gen-health',
      title: 'GEN Health',
      type: 'drillable',
      drilldownPath: genHealthPath,
      component: GenHealthTile,
    };
    
    // Insert gen-health after the first 4 cards (hero + context rows)
    return [
      ...staticCards.slice(0, 4),
      genHealthCard,
      ...staticCards.slice(4),
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
