import { useMemo } from 'react';
import { CommandCenter, CommandCard } from '@/components/layout/CommandCenter';
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
  SystemVitalsTile,
  EliteRotationTile,
  RegimeHistoryTile,
  ShadowTradingTile,
  LiveBrainTile,
  PipelineHealthTile,
  LiveProofTile,
  LiveOrdersFillsTile,
  SafetyPanelTile,
} from '@/components/orbital/tiles/CockpitTiles';
// Drillable cards
import { PositionsCardContent, ActivityCardContent, AgentsCardContent, GenerationsCardContent, AlertsCardContent } from '@/components/orbital/tiles/DrillableCards';

// Card definitions for the 3-column Command Center layout
// LEFT COLUMN (Rolodex): Primary status and context
// MIDDLE COLUMN: Operational controls
// RIGHT COLUMN: Activity and drillable views
const staticCards: CommandCard[] = [
  // Left column - Rolodex (primary status)
  { id: 'decision-state', title: 'Decision State', type: 'cockpit', component: DecisionStateTile },
  { id: 'market-conditions', title: 'Market Conditions', type: 'cockpit', component: MarketConditionsTile },
  { id: 'live-proof', title: 'Live Proof', type: 'cockpit', component: LiveProofTile },
  { id: 'capital', title: 'Capital Overview', type: 'cockpit', component: CapitalOverviewTile },
  { id: 'agent-activity', title: 'Agent Activity', type: 'cockpit', component: AgentInactivityTile },
  { id: 'symbol-coverage', title: 'Symbol Coverage', type: 'cockpit', component: SymbolCoverageTile },
  
  // Middle column - Operations
  { id: 'trade-cycle', title: 'Trade Cycle', type: 'cockpit', component: TradeCycleTile },
  { id: 'control', title: 'System Control', type: 'cockpit', component: SystemControlTile },
  { id: 'live-brain', title: 'Live Brain', type: 'cockpit', component: LiveBrainTile },
  { id: 'live-orders-fills', title: 'Live Orders & Fills', type: 'cockpit', component: LiveOrdersFillsTile },
  { id: 'safety-panel', title: 'Safety Panel', type: 'cockpit', component: SafetyPanelTile },
  { id: 'pipeline-health', title: 'Pipeline Health', type: 'cockpit', component: PipelineHealthTile },
  { id: 'polling', title: 'Polling Health', type: 'cockpit', component: PollingHealthTile },
  { id: 'vitals', title: 'System Vitals', type: 'cockpit', component: SystemVitalsTile },
  { id: 'shadow-trading', title: 'Shadow Trading', type: 'cockpit', component: ShadowTradingTile },
  { id: 'catalyst-watch', title: 'Catalyst Watch', type: 'cockpit', component: CatalystWatchTile },
  { id: 'autopsy', title: 'Performance Autopsy', type: 'cockpit', component: AutopsyTile },
  { id: 'regime-history', title: 'Regime History (24h)', type: 'cockpit', component: RegimeHistoryTile },
  { id: 'system-audit', title: 'System Audit', type: 'cockpit', component: SystemAuditDrawer },
  
  // Right column - Activity & Drillables
  { id: 'activity', title: 'Activity', type: 'drillable', drilldownPath: '/trades', component: ActivityCardContent },
  { id: 'positions', title: 'Positions', type: 'drillable', drilldownPath: '/positions', component: PositionsCardContent },
  { id: 'agents', title: 'Agent Leaderboard', type: 'drillable', drilldownPath: '/agents', component: AgentsCardContent },
  { id: 'generations', title: 'Generations', type: 'drillable', drilldownPath: '/generations', component: GenerationsCardContent },
  { id: 'alerts', title: 'Alerts', type: 'drillable', drilldownPath: '/alerts', component: AlertsCardContent },
  { id: 'gen-compare', title: 'Generation Comparison', type: 'cockpit', component: GenComparisonTile },
  { id: 'lineage', title: 'Lineage', type: 'cockpit', component: LineageTile },
  { id: 'elite-rotation', title: 'Elite Rotation', type: 'cockpit', component: EliteRotationTile },
  { id: 'rollover', title: 'Rollover Checklist', type: 'cockpit', component: RolloverTile },
];

const Index = () => {
  const { isLive, isLiveArmed } = useCurrentTradeMode();
  useRealtimeSubscriptions();
  useBaselineInvariants();
  usePerformanceAlerts();
  const { data: systemState, isLoading } = useSystemState();
  
  const currentGeneration = systemState?.generations as Generation | null;
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  const currentGenId = systemState?.current_generation_id;

  // Build cards with dynamic genId path for GEN Health
  const commandCards = useMemo<CommandCard[]>(() => {
    const genHealthPath = currentGenId 
      ? `/generations/${currentGenId}` 
      : '/generations';
    
    const genHealthCard: CommandCard = {
      id: 'gen-health',
      title: 'GEN Health',
      type: 'drillable',
      drilldownPath: genHealthPath,
      component: GenHealthTile,
    };
    
    // Insert gen-health into the left column cards (after capital)
    const leftColumnEnd = staticCards.findIndex(c => c.id === 'symbol-coverage');
    return [
      ...staticCards.slice(0, leftColumnEnd),
      genHealthCard,
      ...staticCards.slice(leftColumnEnd),
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
        <CommandCenter cards={commandCards} />
      </div>
    </div>
  );
};

export default Index;
